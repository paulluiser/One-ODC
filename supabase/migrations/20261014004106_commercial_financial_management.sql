-- Independent project-level financial values and actual payments; no closure/accounting workflow.
create table public.project_financial_values (
 project_id uuid not null references public.projects(id), kind text not null check(kind in ('Sale','Raw')),
 amount numeric(28,2) not null check(amount>=0 and amount<1e26), version integer not null default 1,
 updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(), primary key(project_id,kind)
);
create index financial_values_actor on public.project_financial_values(updated_by);
create table public.financial_value_events (
 id uuid primary key default gen_random_uuid(), project_id uuid not null, kind text not null, version integer not null,
 previous_amount numeric(28,2), new_amount numeric(28,2) not null, actor_id uuid not null references public.profiles(id),
 reason text not null, occurred_at timestamptz not null default now(), foreign key(project_id,kind) references public.project_financial_values(project_id,kind),unique(project_id,kind,version)
);
create index financial_value_event_actor on public.financial_value_events(actor_id);
create table public.project_payments (
 id uuid primary key, project_id uuid not null references public.projects(id), kind text not null check(kind in ('client','supplier')),
 payment_date date not null, amount numeric(28,2) not null check(amount>=0 and amount<1e26), method text not null check(length(trim(method)) between 1 and 100),
 reference text not null default '' check(length(reference)<=200), remarks text not null default '' check(length(remarks)<=2000),
 version integer not null default 1, voided boolean not null default false, voided_at timestamptz, voided_by uuid references public.profiles(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_by uuid not null references public.profiles(id), updated_at timestamptz not null default now(),
 check((not voided and voided_at is null and voided_by is null) or (voided and voided_at is not null and voided_by is not null)), unique(id,project_id,kind)
);
create index payments_project_kind on public.project_payments(project_id,kind,payment_date,id);
create index payments_creator on public.project_payments(created_by);
create index payments_updater on public.project_payments(updated_by);
create index payments_voider on public.project_payments(voided_by);
create table public.payment_events (
 id uuid primary key default gen_random_uuid(), payment_id uuid not null, project_id uuid not null, kind text not null,
 version integer not null, action text not null check(action in ('created','corrected','voided')),
 previous_value jsonb, new_value jsonb not null, actor_id uuid not null references public.profiles(id), reason text not null, occurred_at timestamptz not null default now(),
 foreign key(payment_id,project_id,kind) references public.project_payments(id,project_id,kind), unique(payment_id,version)
);
create index payment_events_project on public.payment_events(project_id,kind,occurred_at);
create index payment_events_actor on public.payment_events(actor_id);
create trigger financial_value_event_immutable before update or delete on public.financial_value_events for each row execute function private.reject_audit_mutation();
create trigger payment_event_immutable before update or delete on public.payment_events for each row execute function private.reject_audit_mutation();

alter table public.project_financial_values enable row level security;
alter table public.financial_value_events enable row level security;
alter table public.project_payments enable row level security;
alter table public.payment_events enable row level security;
revoke all on public.project_financial_values,public.financial_value_events,public.project_payments,public.payment_events from public,anon,authenticated;
grant select on public.project_financial_values,public.financial_value_events,public.project_payments,public.payment_events to authenticated;

create function private.finance_manager(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_pipeline(p_project) and (private.current_role() in ('system_administrator','lead_designer') or (private.current_role()='operations_admin' and exists(select 1 from public.projects where id=p_project and commercial_status='Closed')))
$$;
create function private.finance_reader(p_project uuid,p_kind text) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and private.can_read_pipeline(p_project) and case p_kind when 'Sale' then private.current_role() in ('system_administrator','lead_designer','designer','bdm') when 'Raw' then private.finance_manager(p_project) when 'payment' then private.current_role()<>'operations_admin' or private.finance_manager(p_project) else false end
$$;
create function private.sale_editor(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role()='system_administrator' or (private.current_role()='bdm' and private.can_read_pipeline(p_project) and exists(select 1 from public.project_memberships where project_id=p_project and user_id=auth.uid() and membership_role='bdm' and is_primary))
$$;
revoke all on function private.finance_manager(uuid),private.finance_reader(uuid,text),private.sale_editor(uuid) from public,anon;
grant execute on function private.finance_manager(uuid),private.finance_reader(uuid,text),private.sale_editor(uuid) to authenticated;
create policy financial_value_read on public.project_financial_values for select to authenticated using(private.finance_reader(project_id,kind));
create policy financial_history_read on public.financial_value_events for select to authenticated using(private.finance_reader(project_id,kind));
create policy payment_read on public.project_payments for select to authenticated using(private.finance_reader(project_id,'payment'));
create policy payment_history_read on public.payment_events for select to authenticated using(private.finance_reader(project_id,'payment'));

create function private.protect_financial_record() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if (new.project_id,new.kind) is distinct from (old.project_id,old.kind) then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_TABLE_NAME='project_payments' then
  if old.voided or (new.id,new.created_by,new.created_at) is distinct from (old.id,old.created_by,old.created_at) then raise exception 'HISTORY_IMMUTABLE'; end if;
 end if;
 if new.version<>old.version+1 then raise exception 'VERSION_CONFLICT'; end if;
 return new;
end; $$;
revoke all on function private.protect_financial_record() from public,anon,authenticated;
create trigger value_guard before update or delete on public.project_financial_values for each row execute function private.protect_financial_record();
create trigger payment_guard before update or delete on public.project_payments for each row execute function private.protect_financial_record();
create function private.payment_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(p)||jsonb_build_object('amount',p.amount::text) from public.project_payments p where id=p_id
$$;
revoke all on function private.payment_snapshot(uuid) from public,anon,authenticated;

create function private.set_financial_value(p_project uuid,p_kind text,p_amount text,p_expected_version integer,p_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare v public.project_financial_values; reason text:=trim(coalesce(p_reason,'')); n integer;
begin
 perform private.require_role(array['system_administrator','lead_designer','bdm','operations_admin']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.finance_reader(p_project,p_kind) or not coalesce(case p_kind when 'Sale' then private.sale_editor(p_project) when 'Raw' then private.finance_manager(p_project) else false end,false) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.projects where id=p_project and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 if p_amount is null or p_amount !~ '^(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?$' then raise exception 'INVALID_AMOUNT'; end if;
 select * into v from public.project_financial_values where project_id=p_project and kind=p_kind for update;
 if p_expected_version is null or p_expected_version<>coalesce(v.version,0) then raise exception 'VERSION_CONFLICT'; end if;
 if length(reason)>2000 or (length(reason)=0 and (v.version is not null or p_kind='Raw' or private.current_role()='system_administrator')) then raise exception 'REASON_REQUIRED'; end if;
 if reason='' then reason:='Initial Sale recorded'; end if;
 n:=coalesce(v.version,0)+1;
 insert into public.project_financial_values(project_id,kind,amount,version,updated_by) values(p_project,p_kind,p_amount::numeric,n,auth.uid()) on conflict(project_id,kind) do update set amount=excluded.amount,version=excluded.version,updated_by=auth.uid(),updated_at=clock_timestamp();
 insert into public.financial_value_events(project_id,kind,version,previous_amount,new_amount,actor_id,reason) values(p_project,p_kind,n,v.amount,p_amount::numeric,auth.uid(),reason);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'finance',p_project,'finance.value_changed',jsonb_build_object('kind',p_kind,'amount',v.amount::text),jsonb_build_object('kind',p_kind,'amount',(p_amount::numeric(28,2))::text,'version',n,'reason',reason,'administrative_override',private.current_role()='system_administrator'));
 return n;
end; $$;
revoke all on function private.set_financial_value(uuid,text,text,integer,text) from public,anon,authenticated;

create function private.mutate_payment(p_id uuid,p_project uuid,p_kind text,p_expected_version integer,p_intent text,p_data jsonb,p_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare v public.project_payments; previous jsonb; next_value jsonb; reason text:=trim(coalesce(p_reason,'')); paid date; n integer; action text;
begin
 perform private.require_role(array['system_administrator','lead_designer','operations_admin']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not coalesce(private.finance_manager(p_project),false) then raise exception 'ACCESS_DENIED'; end if;
 if p_id is null or p_kind is null or p_kind not in ('client','supplier') or p_intent is null or p_intent not in ('save','void') then raise exception 'INVALID_PAYMENT'; end if;
 select * into v from public.project_payments where id=p_id for update;
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
revoke all on function private.mutate_payment(uuid,uuid,text,integer,text,jsonb,text) from public,anon,authenticated;

-- Build only permitted fields. Missing amounts are distinct from explicitly recorded zero.
create function private.get_project_financials(p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; value_kind text; payment_kind text; current_value public.project_financial_values; amount_sale numeric; amount_raw numeric; approved jsonb; paid numeric; block jsonb;
begin
 if not private.finance_reader(p_project,'payment') then raise exception 'ACCESS_DENIED'; end if;
 result:=jsonb_build_object('project_id',p_project,'currency','PHP','today',(now() at time zone coalesce((select timezone from public.project_monitoring where project_id=p_project),'Asia/Manila'))::date,'cancelled',(select is_cancelled from public.projects where id=p_project),'can_manage_payments',private.finance_manager(p_project));
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
revoke all on function private.get_project_financials(uuid) from public,anon,authenticated;
create function public.set_financial_value(p_project uuid,p_kind text,p_amount text,p_expected_version integer,p_reason text) returns integer language sql security invoker set search_path='' as $$select private.set_financial_value(p_project,p_kind,p_amount,p_expected_version,p_reason)$$;
create function public.mutate_payment(p_id uuid,p_project uuid,p_kind text,p_expected_version integer,p_intent text,p_data jsonb,p_reason text) returns integer language sql security invoker set search_path='' as $$select private.mutate_payment(p_id,p_project,p_kind,p_expected_version,p_intent,p_data,p_reason)$$;
create function public.get_project_financials(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$select private.get_project_financials(p_project)$$;
revoke all on function public.set_financial_value(uuid,text,text,integer,text),public.mutate_payment(uuid,uuid,text,integer,text,jsonb,text),public.get_project_financials(uuid) from public,anon,authenticated;
grant execute on function public.set_financial_value(uuid,text,text,integer,text),public.mutate_payment(uuid,uuid,text,integer,text,jsonb,text),public.get_project_financials(uuid),private.set_financial_value(uuid,text,text,integer,text),private.mutate_payment(uuid,uuid,text,integer,text,jsonb,text),private.get_project_financials(uuid) to authenticated;
