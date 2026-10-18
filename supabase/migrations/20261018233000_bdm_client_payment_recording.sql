-- BDMs may append client receipts only within their existing project scope.
-- Do not broaden finance_manager: supplier payments, Raw, corrections and voids stay restricted.
create function private.bdm_client_payment_recorder(p_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(private.current_role()='bdm' and private.can_read_pipeline(p_project)
 and exists(select 1 from public.project_memberships where project_id=p_project and user_id=auth.uid() and membership_role='bdm')
 and exists(select 1 from public.projects where id=p_project and not is_cancelled and commercial_status<>'Lost'),false)
$$;
revoke all on function private.bdm_client_payment_recorder(uuid) from public,anon;
grant execute on function private.bdm_client_payment_recorder(uuid) to authenticated;
create or replace function private.mutate_payment(p_id uuid,p_project uuid,p_kind text,p_expected_version integer,p_intent text,p_data jsonb,p_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare v public.project_payments; previous jsonb; next_value jsonb; reason text:=trim(coalesce(p_reason,'')); paid date; n integer; action text;
begin
 perform private.require_role(array['system_administrator','lead_designer','operations_admin','bdm']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not (coalesce(private.finance_manager(p_project),false) or (p_kind='client' and p_intent='save' and p_expected_version=0 and private.bdm_client_payment_recorder(p_project))) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is null or p_kind is null or p_kind not in ('client','supplier') or p_intent is null or p_intent not in ('save','void') then raise exception 'INVALID_PAYMENT'; end if;
 select * into v from public.project_payments where id=p_id for update;
 if private.current_role()='bdm' and v.id is not null then raise exception 'ACCESS_DENIED';end if;
 if v.id is not null and (v.project_id<>p_project or v.kind<>p_kind) then raise exception 'ACCESS_DENIED'; end if;
 if p_expected_version is null or p_expected_version<>coalesce(v.version,0) then raise exception 'VERSION_CONFLICT'; end if;
 if v.voided then raise exception 'PAYMENT_VOIDED'; end if;
 if length(reason)>2000 or (reason='' and (v.id is not null or p_intent='void' or private.current_role()='system_administrator')) then raise exception 'REASON_REQUIRED'; end if;
 if reason='' then reason:='Payment recorded'; end if;
 if p_intent='void' and v.id is null then raise exception 'INVALID_PAYMENT'; end if;
 if v.id is null and exists(select 1 from public.projects where id=p_project and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 previous:=private.payment_snapshot(p_id); n:=coalesce(v.version,0)+1;
 if p_intent='void' then
  update public.project_payments set voided=true,voided_at=clock_timestamp(),voided_by=auth.uid(),version=n,updated_at=clock_timestamp(),updated_by=auth.uid() where id=p_id;
  action:='voided';
 else
  if p_data is null or jsonb_typeof(p_data)<>'object' or jsonb_typeof(p_data->'amount') is distinct from 'string' or coalesce(p_data->>'amount','') !~ '^(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?$'
   or jsonb_typeof(p_data->'payment_date') is distinct from 'string' or coalesce(p_data->>'payment_date','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
   or jsonb_typeof(p_data->'method') is distinct from 'string' or length(trim(p_data->>'method')) not between 1 and 100
   or (p_data ? 'reference' and (jsonb_typeof(p_data->'reference') is distinct from 'string' or length(p_data->>'reference')>200))
   or (p_data ? 'remarks' and (jsonb_typeof(p_data->'remarks') is distinct from 'string' or length(p_data->>'remarks')>2000)) then raise exception 'INVALID_PAYMENT'; end if;
  paid:=(p_data->>'payment_date')::date;
  if paid>(clock_timestamp() at time zone coalesce((select timezone from public.project_monitoring where project_id=p_project),'Asia/Manila'))::date then raise exception 'INVALID_PAYMENT'; end if;
  insert into public.project_payments(id,project_id,kind,payment_date,amount,method,reference,remarks,version,created_by,updated_by)
   values(p_id,p_project,p_kind,paid,(p_data->>'amount')::numeric,trim(p_data->>'method'),trim(coalesce(p_data->>'reference','')),trim(coalesce(p_data->>'remarks','')),n,auth.uid(),auth.uid())
   on conflict(id) do update set payment_date=excluded.payment_date,amount=excluded.amount,method=excluded.method,reference=excluded.reference,remarks=excluded.remarks,version=n,updated_at=clock_timestamp(),updated_by=auth.uid();
  action:=case when v.id is null then 'created' else 'corrected' end;
 end if;
 next_value:=private.payment_snapshot(p_id);
 insert into public.payment_events(payment_id,project_id,kind,version,action,previous_value,new_value,actor_id,reason) values(p_id,p_project,p_kind,n,action,previous,next_value,auth.uid(),reason);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'payment',p_id,'finance.payment_'||action,previous,next_value||jsonb_build_object('reason',reason,'administrative_override',private.current_role()='system_administrator'));
 return n;
end; $$;
create or replace function private.get_project_financials(p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; value_kind text; payment_kind text; current_value public.project_financial_values; amount_sale numeric; amount_raw numeric; approved jsonb; paid numeric; block jsonb;
begin
 if not private.finance_reader(p_project,'payment') then raise exception 'ACCESS_DENIED'; end if;
 result:=jsonb_build_object('project_id',p_project,'currency','PHP','today',(now() at time zone coalesce((select timezone from public.project_monitoring where project_id=p_project),'Asia/Manila'))::date,'cancelled',(select is_cancelled from public.projects where id=p_project),'can_manage_payments',private.finance_manager(p_project),'can_record_client_payments',private.bdm_client_payment_recorder(p_project));
 for value_kind in select unnest(array['Sale','Raw']) loop
  if private.finance_reader(p_project,value_kind) then
   select * into current_value from public.project_financial_values where project_id=p_project and kind=value_kind;
   if value_kind='Sale' then amount_sale:=current_value.amount; else amount_raw:=current_value.amount; end if;
   result:=result||jsonb_build_object(lower(value_kind),jsonb_build_object('amount',current_value.amount::text,'version',coalesce(current_value.version,0),'editable',not (select is_cancelled from public.projects where id=p_project) and case value_kind when 'Sale' then private.sale_editor(p_project) else private.finance_manager(p_project) end,
    'history',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'previous_amount',e.previous_amount::text,'new_amount',e.new_amount::text,'version',e.version,'actor_id',e.actor_id,'reason',e.reason,'occurred_at',e.occurred_at) order by e.version) from public.financial_value_events e where e.project_id=p_project and e.kind=value_kind),'[]'::jsonb)));
  end if;
 end loop;
 if private.quotation_reader(p_project,'Approved') then
  select jsonb_build_object('id',id,'number',number,'total',snapshot->>'total') into approved from public.quotation_versions where project_id=p_project and state='Approved' order by number desc limit 1;
  result:=result||jsonb_build_object('approved_quotation',approved);
  if private.finance_reader(p_project,'Sale') then result:=result||jsonb_build_object('quotation_vs_sale',(amount_sale-(approved->>'total')::numeric)::text); end if;
 end if;
 if private.finance_reader(p_project,'Sale') and private.finance_reader(p_project,'Raw') then result:=result||jsonb_build_object('sale_minus_raw',(amount_sale-amount_raw)::text); end if;
 for payment_kind in select unnest(array['client','supplier']) loop
  select coalesce(sum(amount),0) into paid from public.project_payments where project_id=p_project and kind=payment_kind and not voided;
  block:=jsonb_build_object('total',paid::text,'records',coalesce((select jsonb_agg(private.payment_snapshot(p.id)||jsonb_build_object('history',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'action',e.action,'actor_id',e.actor_id,'reason',e.reason,'occurred_at',e.occurred_at,'previous_value',e.previous_value,'new_value',e.new_value) order by e.version) from public.payment_events e where e.payment_id=p.id),'[]'::jsonb)) order by p.payment_date,p.created_at,p.id) from public.project_payments p where p.project_id=p_project and p.kind=payment_kind),'[]'::jsonb));
  if payment_kind='client' and private.finance_reader(p_project,'Sale') then block:=block||jsonb_build_object('outstanding',(amount_sale-paid)::text); end if;
  if payment_kind='supplier' and private.finance_reader(p_project,'Raw') then block:=block||jsonb_build_object('outstanding',(amount_raw-paid)::text); end if;
  result:=result||jsonb_build_object(payment_kind||'_payments',block);
 end loop;
 return result;
end; $$;

