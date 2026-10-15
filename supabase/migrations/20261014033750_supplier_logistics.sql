-- Operational monitoring only: no purchase, accounting or payment automation.
create table public.suppliers (
 id uuid primary key default gen_random_uuid(), name text not null check(length(trim(name)) between 1 and 200),
 normalized_name text generated always as (lower(regexp_replace(trim(name),'[[:space:]]+',' ','g'))) stored unique,
 brand text check(brand in ('SFY','Stosa','Both')), contact_person text not null default '' check(length(contact_person)<=200),
 contact_details text not null default '' check(length(contact_details)<=2000), remarks text not null default '' check(length(remarks)<=4000),
 active boolean not null default true, version integer not null default 1,
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create index supplier_creator on public.suppliers(created_by);
create index supplier_updater on public.suppliers(updated_by);
create table public.supplier_events (
 id uuid primary key default gen_random_uuid(),supplier_id uuid not null references public.suppliers(id),version integer not null,
 actor_id uuid not null references public.profiles(id),occurred_at timestamptz not null default now(),reason text not null,
 previous_value jsonb,new_value jsonb not null,unique(supplier_id,version)
);
create index supplier_events_actor on public.supplier_events(actor_id);
create table public.project_logistics (
 id uuid primary key,project_id uuid not null references public.projects(id),supplier_id uuid not null references public.suppliers(id),
 supplier_name text not null,brand text check(brand in ('SFY','Stosa','Both')),reference text not null default '' check(length(reference)<=200),
 remarks text not null default '' check(length(remarks)<=4000),status text not null default 'RFP' check(status in ('RFP','Supplier Adjustments','For Manufacturing','In Transit','Landed','For Delivery','Delivered','On Hold','Cancelled')),
 held_status text,version integer not null default 1,status_at timestamptz not null default now(),
 created_by uuid not null references public.profiles(id),updated_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 check((status='On Hold' and held_status in ('RFP','Supplier Adjustments','For Manufacturing','In Transit','Landed','For Delivery')) or (status<>'On Hold' and held_status is null)),unique(id,project_id)
);
create index logistics_project on public.project_logistics(project_id,created_at,id);
create index logistics_supplier on public.project_logistics(supplier_id);
create index logistics_creator on public.project_logistics(created_by);
create index logistics_updater on public.project_logistics(updated_by);
create table public.logistics_events (
 id uuid primary key,logistics_id uuid not null,project_id uuid not null,version integer not null,
 action text not null check(action in ('created','edited','status_changed')),actor_id uuid not null references public.profiles(id),
 occurred_at timestamptz not null default now(),reason text not null,previous_value jsonb,new_value jsonb not null,
 administrative_override boolean not null default false,foreign key(logistics_id,project_id) references public.project_logistics(id,project_id),unique(logistics_id,version)
);
create index logistics_events_project_time on public.logistics_events(project_id,occurred_at,id);
create index logistics_events_actor on public.logistics_events(actor_id);
create trigger supplier_events_immutable before update or delete on public.supplier_events for each row execute function private.reject_audit_mutation();
create trigger logistics_events_immutable before update or delete on public.logistics_events for each row execute function private.reject_audit_mutation();

create function private.supplier_manager() returns boolean language sql stable security definer set search_path='' as $$select private.current_role() in ('operations_admin','lead_designer','system_administrator')$$;
create function private.logistics_reader(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$select private.can_read_pipeline(p_project) and exists(select 1 from public.projects where id=p_project and commercial_status='Closed')$$;
revoke all on function private.supplier_manager(),private.logistics_reader(uuid) from public,anon;
grant execute on function private.supplier_manager(),private.logistics_reader(uuid) to authenticated;
alter table public.suppliers enable row level security;
alter table public.supplier_events enable row level security;
alter table public.project_logistics enable row level security;
alter table public.logistics_events enable row level security;
revoke all on public.suppliers,public.supplier_events,public.project_logistics,public.logistics_events from public,anon,authenticated;
grant select on public.suppliers,public.supplier_events,public.project_logistics,public.logistics_events to authenticated;
create policy supplier_read on public.suppliers for select to authenticated using(private.supplier_manager());
create policy supplier_event_read on public.supplier_events for select to authenticated using(private.supplier_manager());
create policy logistics_read on public.project_logistics for select to authenticated using(private.logistics_reader(project_id));
create policy logistics_event_read on public.logistics_events for select to authenticated using(private.logistics_reader(project_id));

create function private.protect_operational_record() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if new.version<>old.version+1 or (new.id,new.created_by,new.created_at) is distinct from (old.id,old.created_by,old.created_at) then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_TABLE_NAME='project_logistics' then
  if (new.project_id,new.supplier_id,new.supplier_name) is distinct from (old.project_id,old.supplier_id,old.supplier_name) then raise exception 'HISTORY_IMMUTABLE'; end if;
 end if;
 return new;
end $$;
revoke all on function private.protect_operational_record() from public,anon,authenticated;
create trigger supplier_guard before update or delete on public.suppliers for each row execute function private.protect_operational_record();
create trigger logistics_guard before update or delete on public.project_logistics for each row execute function private.protect_operational_record();

create function private.save_supplier(p_id uuid,p_version integer,p_data jsonb,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.suppliers; current public.suppliers; reason text:=trim(coalesce(p_reason,'')); supplier_label text:=trim(coalesce(p_data->>'name',''));
begin
 perform private.require_role(array['operations_admin','lead_designer','system_administrator']::public.app_role[]);
 perform pg_advisory_xact_lock(813004);
 if p_id is null or p_version is null or p_version<0 or jsonb_typeof(p_data) is distinct from 'object' or length(supplier_label) not between 1 and 200
 or coalesce(p_data->>'brand','') not in ('','SFY','Stosa','Both') or length(coalesce(p_data->>'contact_person',''))>200
 or length(coalesce(p_data->>'contact_details',''))>2000 or length(coalesce(p_data->>'remarks',''))>4000 or jsonb_typeof(p_data->'active') is distinct from 'boolean' then raise exception 'INVALID_SUPPLIER'; end if;
 if length(reason) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 select * into previous from public.suppliers where id=p_id for update;
 if coalesce(previous.version,0)<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 if exists(select 1 from public.suppliers where normalized_name=lower(regexp_replace(supplier_label,'[[:space:]]+',' ','g')) and id<>p_id) then raise exception 'DUPLICATE_SUPPLIER'; end if;
 if previous.id is null then
  insert into public.suppliers(id,name,brand,contact_person,contact_details,remarks,active,created_by,updated_by)
  values(p_id,supplier_label,nullif(p_data->>'brand',''),coalesce(p_data->>'contact_person',''),coalesce(p_data->>'contact_details',''),coalesce(p_data->>'remarks',''),(p_data->>'active')::boolean,auth.uid(),auth.uid()) returning * into current;
 else
  update public.suppliers set name=supplier_label,brand=nullif(p_data->>'brand',''),contact_person=coalesce(p_data->>'contact_person',''),contact_details=coalesce(p_data->>'contact_details',''),remarks=coalesce(p_data->>'remarks',''),active=(p_data->>'active')::boolean,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into current;
 end if;
 insert into public.supplier_events(supplier_id,version,actor_id,reason,previous_value,new_value) values(p_id,current.version,auth.uid(),reason,case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(current));
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),'supplier',p_id,'supplier.saved',case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(current)||jsonb_build_object('reason',reason));
 return p_id;
end $$;

create function private.save_logistics(p_id uuid,p_project uuid,p_version integer,p_supplier uuid,p_data jsonb,p_reason text,p_override boolean) returns uuid language plpgsql security definer set search_path='' as $$
declare project public.projects; previous public.project_logistics; current public.project_logistics; supplier public.suppliers; manager boolean; acknowledged boolean; held boolean;
 stages text[]:=array['RFP','Supplier Adjustments','For Manufacturing','In Transit','Landed','For Delivery','Delivered']; next_status text:=p_data->>'status'; reason text:=trim(coalesce(p_reason,'')); needs_reason boolean; event uuid:=gen_random_uuid(); override_used boolean:=false;
begin
 perform private.require_role(array['operations_admin','lead_designer','system_administrator']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 manager:=private.space_manager(p_project);
 if not found or not private.logistics_reader(p_project) or not (manager or private.current_role()='operations_admin') then raise exception 'ACCESS_DENIED'; end if;
 if project.is_cancelled then raise exception 'PROJECT_CANCELLED'; end if;
 select coalesce(state='On Hold',false) into held from public.project_monitoring where project_id=p_project;
 select exists(select 1 from public.project_handoffs where project_id=p_project and superseded_at is null and status='Acknowledged') into acknowledged;
 if not acknowledged then
  if not manager or not coalesce(p_override,false) or reason='' then raise exception 'HANDOFF_REQUIRED'; end if;
  override_used:=true;
 end if;
 if coalesce(p_override,false) and not manager then raise exception 'ACCESS_DENIED'; end if;
 if p_id is null or p_version is null or p_version<0 or jsonb_typeof(p_data) is distinct from 'object' or coalesce(next_status,'') not in ('RFP','Supplier Adjustments','For Manufacturing','In Transit','Landed','For Delivery','Delivered','On Hold','Cancelled')
 or coalesce(p_data->>'brand','') not in ('','SFY','Stosa','Both') or length(coalesce(p_data->>'reference',''))>200 or length(coalesce(p_data->>'remarks',''))>4000 or length(reason)>2000 then raise exception 'INVALID_LOGISTICS'; end if;
 select * into previous from public.project_logistics where id=p_id for update;
 if previous.id is not null and previous.project_id<>p_project then raise exception 'ACCESS_DENIED'; end if;
 if coalesce(previous.version,0)<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 if previous.id is null then
  if held then raise exception 'PROJECT_HELD'; end if;
  select * into supplier from public.suppliers where id=p_supplier and active for share;
  if not found then raise exception 'INACTIVE_SUPPLIER'; end if;
  if next_status<>'RFP' then raise exception 'INITIAL_STATUS_RFP'; end if;
  needs_reason:=true;
  insert into public.project_logistics(id,project_id,supplier_id,supplier_name,brand,reference,remarks,created_by,updated_by)
  values(p_id,p_project,p_supplier,supplier.name,nullif(p_data->>'brand',''),coalesce(p_data->>'reference',''),coalesce(p_data->>'remarks',''),auth.uid(),auth.uid()) returning * into current;
 else
  if previous.supplier_id is distinct from p_supplier then raise exception 'HISTORY_IMMUTABLE'; end if;
  if held and next_status<>previous.status then raise exception 'PROJECT_HELD'; end if;
  needs_reason:=next_status in ('On Hold','Cancelled') or previous.status='On Hold' or previous.status in ('Delivered','Cancelled') or
   coalesce(array_position(stages,next_status),0)<>coalesce(array_position(stages,previous.status),0)+1;
  if next_status<>previous.status and ((previous.status in ('Delivered','Cancelled')) or
   (previous.status='On Hold' and next_status not in (previous.held_status,'Cancelled')) or
   (previous.status<>'On Hold' and array_position(stages,next_status)<array_position(stages,previous.status))) then
   if not manager or not coalesce(p_override,false) or reason='' then raise exception 'MANAGER_OVERRIDE_REQUIRED'; end if;
   override_used:=true;
  end if;
  update public.project_logistics set brand=nullif(p_data->>'brand',''),reference=coalesce(p_data->>'reference',''),remarks=coalesce(p_data->>'remarks',''),status=next_status,
  held_status=case when next_status='On Hold' then case when previous.status='On Hold' then previous.held_status else previous.status end else null end,
  status_at=case when next_status<>previous.status then now() else previous.status_at end,version=version+1,updated_by=auth.uid(),updated_at=now() where id=p_id returning * into current;
 end if;
 if (needs_reason or override_used or coalesce(p_override,false) or private.current_role()='system_administrator' or coalesce(p_override,false)) and reason='' then raise exception 'REASON_REQUIRED'; end if;
 if reason='' then reason:='Normal logistics stage progression'; end if;
 insert into public.logistics_events(id,logistics_id,project_id,version,action,actor_id,reason,previous_value,new_value,administrative_override)
 values(event,p_id,p_project,current.version,case when previous.id is null then 'created' when previous.status=current.status then 'edited' else 'status_changed' end,auth.uid(),reason,case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(current),override_used or coalesce(p_override,false) or private.current_role()='system_administrator');
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'logistics',p_id,'logistics.saved',case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(current)||jsonb_build_object('reason',reason,'administrative_override',override_used or coalesce(p_override,false) or private.current_role()='system_administrator'));
 return p_id;
end $$;

create function public.save_supplier(p_id uuid,p_version integer,p_data jsonb,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.save_supplier(p_id,p_version,p_data,p_reason)$$;
create function public.save_logistics(p_id uuid,p_project uuid,p_version integer,p_supplier uuid,p_data jsonb,p_reason text,p_override boolean default false) returns uuid language sql security invoker set search_path='' as $$select private.save_logistics(p_id,p_project,p_version,p_supplier,p_data,p_reason,p_override)$$;
revoke all on function private.save_supplier(uuid,integer,jsonb,text),public.save_supplier(uuid,integer,jsonb,text),private.save_logistics(uuid,uuid,integer,uuid,jsonb,text,boolean),public.save_logistics(uuid,uuid,integer,uuid,jsonb,text,boolean) from public,anon;
grant execute on function private.save_supplier(uuid,integer,jsonb,text),public.save_supplier(uuid,integer,jsonb,text),private.save_logistics(uuid,uuid,integer,uuid,jsonb,text,boolean),public.save_logistics(uuid,uuid,integer,uuid,jsonb,text,boolean) to authenticated;

create or replace function private.project_timeline(p_project uuid,p_category text default '',p_from date default null,p_to date default null,p_actor uuid default null,p_space uuid default null,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_role(enum_range(null::public.app_role));
 if not private.can_read_monitoring(p_project) then raise exception 'ACCESS_DENIED';end if;
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'VALIDATION_ERROR';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
 select * from (
 select a.id,a.space_id,a.created_by actor_id,a.category,a.description,a.activity_date date,a.activity_date::timestamp at time zone m.timezone occurred_at,a.recorded_at,'manual' kind from public.project_activities a join public.project_monitoring m on m.project_id=a.project_id where a.project_id=p_project and private.can_read_activity(p_project,a.category)
 union all select e.id,e.space_id,e.actor_id,'System Event',e.action||': '||e.reason,(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.space_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and private.can_read_spaces(p_project)
 union all select e.id,null,e.actor_id,'System Event',e.action||': '||coalesce(e.new_value->>'reason',''),(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.audit_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and e.action in ('project.hold','project.resume','project.cancel','project.reopen','project.deadline_revised')
 union all select e.id,null,e.actor_id,'System Event','project.assignments_changed: '||e.reason,(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.project_assignment_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and private.can_read_spaces(p_project)
 union all select e.id,(e.new_value->>'space_id')::uuid,e.actor_id,'System Event',e.action||': '||coalesce(e.new_value->>'reason',''),(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.audit_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and e.action in ('activity.created','activity.corrected') and private.can_read_activity(p_project,e.new_value->>'category') and private.can_read_activity(p_project,coalesce(e.previous_value->>'category',e.new_value->>'category'))
 union all select e.id,null,e.actor_id,'Supplier Update','Logistics '||e.action||': '||coalesce(e.previous_value->>'status','New')||' → '||(e.new_value->>'status')||' · '||e.reason,(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.logistics_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and private.logistics_reader(p_project)
 ) t where (coalesce(p_category,'')='' or t.category=p_category) and (p_from is null or t.date>=p_from) and (p_to is null or t.date<=p_to) and (p_actor is null or t.actor_id=p_actor) and (p_space is null or t.space_id=p_space) order by occurred_at desc,recorded_at desc,id limit 50 offset p_offset
 ) x;return result;
end; $$;

