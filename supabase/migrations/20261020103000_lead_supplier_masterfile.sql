-- A request selects a supplier identity; retain brand/name snapshots for history.
alter table public.leads add column supplier_id uuid references public.suppliers(id);
alter table public.leads add column supplier_name text;
create index leads_supplier on public.leads(supplier_id);

-- Only minimal active options are exposed to request authors, never contacts/remarks.
create function private.list_lead_suppliers() returns table(id uuid,name text,brand text)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['bdm','lead_designer','system_administrator']::public.app_role[]);
 return query select s.id,s.name,s.brand from public.suppliers s where s.active order by s.name,s.id;
end $$;
create function public.list_lead_suppliers() returns table(id uuid,name text,brand text)
language sql security invoker set search_path='' as $$select * from private.list_lead_suppliers()$$;
revoke all on function private.list_lead_suppliers(),public.list_lead_suppliers() from public,anon;
grant execute on function private.list_lead_suppliers(),public.list_lead_suppliers() to authenticated;

-- Extend the existing transactional handler without replacing its permission,
-- duplicate, version, submission, notification or audit behavior.
do $patch$
declare definition text;
begin
 definition:=pg_get_functiondef('private.save_lead(uuid,integer,jsonb,boolean,text)'::regprocedure);
 if position('recipient uuid;' in definition)=0 or position('update public.leads set assigned_lead_designer_id=recipient,' in definition)=0 then
  raise exception 'Unexpected save_lead definition; refusing supplier patch';
 end if;
 definition:=replace(definition,'recipient uuid;','recipient uuid; selected_supplier uuid; supplier_record public.suppliers; supplier_label text;');
 definition:=replace(definition,'n:=trim(coalesce(p_payload->>''project_name'',''''));', $code$
 selected_supplier:=nullif(p_payload->>'supplier_id','')::uuid;
 if selected_supplier is not null then
  select * into supplier_record from public.suppliers where id=selected_supplier for share;
  if not found then raise exception 'INVALID_LEAD_SUPPLIER'; end if;
  if not supplier_record.active and not exists(select 1 from public.leads where id=p_id and supplier_id=selected_supplier) then
   raise exception 'INVALID_LEAD_SUPPLIER';
  end if;
  supplier_label:=supplier_record.name;
  p_payload:=p_payload||jsonb_build_object('brand',supplier_record.brand);
 end if;
 n:=trim(coalesce(p_payload->>'project_name',''));
 $code$);
 definition:=replace(definition,'update public.leads set assigned_lead_designer_id=recipient,','update public.leads set supplier_id=selected_supplier,supplier_name=supplier_label,assigned_lead_designer_id=recipient,');
 execute definition;
end $patch$;
