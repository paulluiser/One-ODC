-- Post-closure readiness is independent of design and installation history.
create table public.space_readiness (
 space_id uuid primary key references public.spaces(id),
 project_id uuid not null references public.projects(id),
 status text not null default 'Site Verification' check(status in ('Site Verification','Revision','Site Mapping','Ready for Order','Ordered')),
 version integer not null default 1 check(version>0),
 updated_at timestamptz not null default now(), updated_by uuid references public.profiles(id)
);
create index space_readiness_project_idx on public.space_readiness(project_id);
create table public.space_operational_handoffs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 space_id uuid not null references public.space_readiness(space_id),
 readiness_version integer not null, ops_id uuid not null references public.profiles(id),
 assigned_by uuid not null references public.profiles(id), assigned_at timestamptz not null default now(),
 acknowledged_by uuid references public.profiles(id), acknowledged_at timestamptz,
 invalidated_at timestamptz, reason text not null,
 check((acknowledged_by is null)=(acknowledged_at is null))
);
create unique index space_handoff_current_idx on public.space_operational_handoffs(space_id) where invalidated_at is null;
create index space_handoff_project_idx on public.space_operational_handoffs(project_id);
alter table public.space_readiness enable row level security;
alter table public.space_operational_handoffs enable row level security;
grant select on public.space_readiness,public.space_operational_handoffs to authenticated;
revoke insert,update,delete on public.space_readiness,public.space_operational_handoffs from anon,authenticated;
create policy readiness_read on public.space_readiness for select to authenticated using(private.can_read_spaces(project_id));
create policy space_handoff_read on public.space_operational_handoffs for select to authenticated using(private.can_read_spaces(project_id));
-- Backfill a starting state only, never fabricate prior progress or handoffs.
insert into public.space_readiness(space_id,project_id)
 select s.id,s.project_id from public.spaces s join public.projects p on p.id=s.project_id
 where p.commercial_status='Closed' and not p.is_operationally_completed and s.cancelled_at is null;

create function private.initialize_space_readiness() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_TABLE_NAME='projects' then
  if new.commercial_status='Closed' and (old.commercial_status is distinct from new.commercial_status or (old.is_operationally_completed and not new.is_operationally_completed)) then
   insert into public.space_readiness(space_id,project_id) select id,project_id from public.spaces where project_id=new.id and cancelled_at is null on conflict do nothing;
  end if;
 else
  if exists(select 1 from public.projects where id=new.project_id and commercial_status='Closed') then
   insert into public.space_readiness(space_id,project_id) values(new.id,new.project_id) on conflict do nothing;
  end if;
 end if;
 return new;
end $$;
create trigger initialize_closed_readiness after update of commercial_status,is_operationally_completed on public.projects for each row execute function private.initialize_space_readiness();
create trigger initialize_new_space_readiness after insert on public.spaces for each row execute function private.initialize_space_readiness();

create function private.readiness_edit_guard(p_project uuid) returns void language plpgsql security definer set search_path='' as $$
declare p public.projects;
begin
 select * into p from public.projects where id=p_project for update;
 if not found or not private.can_read_spaces(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if p.commercial_status<>'Closed' or p.is_cancelled then raise exception 'PROJECT_NOT_EDITABLE'; end if;
 if p.is_operationally_completed then raise exception 'PROJECT_COMPLETED_REOPEN_REQUIRED'; end if;
 if exists(select 1 from public.project_monitoring where project_id=p_project and state<>'Active') then raise exception 'PROJECT_HELD'; end if;
end $$;
create function private.change_space_readiness(p_space uuid,p_version integer,p_status text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.spaces; r public.space_readiness; reason text:=trim(coalesce(p_reason,''));
begin
 perform private.require_role(array['designer','lead_designer','system_administrator']::public.app_role[]);
 select * into s from public.spaces where id=p_space;
 perform private.readiness_edit_guard(s.project_id);
 if s.cancelled_at is not null or not coalesce(private.space_editor(p_space),false) then raise exception 'ACCESS_DENIED'; end if;
 insert into public.space_readiness(space_id,project_id) values(s.id,s.project_id) on conflict do nothing;
 select * into r from public.space_readiness where space_id=p_space for update;
 if r.version is distinct from p_version then raise exception 'VERSION_CONFLICT'; end if;
 if p_status is null or p_status not in ('Site Verification','Revision','Site Mapping','Ready for Order','Ordered') or p_status=r.status then raise exception 'INVALID_TRANSITION'; end if;
 if length(reason) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 if r.status='Ordered' and not private.space_manager(s.project_id) then raise exception 'ORDERED_TERMINAL'; end if;
 update public.space_readiness set status=p_status,version=version+1,updated_at=now(),updated_by=auth.uid() where space_id=p_space;
 if r.status='Ordered' then
  update public.space_operational_handoffs set invalidated_at=now() where space_id=p_space and invalidated_at is null;
 end if;
 perform private.record_space_event(p_space,case when r.status='Ordered' then 'space.readiness_rolled_back' else 'space.readiness_changed' end,reason,to_jsonb(r),jsonb_build_object('readiness_status',p_status,'previous_readiness_status',r.status));
end $$;
create function public.change_space_readiness(p_space uuid,p_version integer,p_status text,p_reason text) returns void language sql set search_path='' as $$select private.change_space_readiness($1,$2,$3,$4)$$;

create function private.handoff_ordered_spaces(p_project uuid,p_spaces uuid[],p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.spaces; ready public.space_readiness; ops uuid; reason text:=trim(coalesce(p_reason,'')); hid uuid;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform private.readiness_edit_guard(p_project);
 if not private.space_manager(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if coalesce(cardinality(p_spaces),0) not between 1 and 100 or length(reason) not between 1 and 2000 then raise exception 'VALIDATION_ERROR'; end if;
 select m.user_id into ops from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project and m.membership_role='operations_admin' and m.is_primary and p.active and p.role='operations_admin';
 if ops is null then raise exception 'OPERATIONS_ADMIN_REQUIRED'; end if;
 for s in select * from public.spaces where id=any(p_spaces) and project_id=p_project and cancelled_at is null order by id loop
  select * into ready from public.space_readiness where space_id=s.id for update;
  if ready.status is distinct from 'Ordered' then raise exception 'SPACE_NOT_ORDERED'; end if;
  if exists(select 1 from public.space_operational_handoffs where space_id=s.id and invalidated_at is null and ops_id=ops) then continue; end if;
  update public.space_operational_handoffs set invalidated_at=now() where space_id=s.id and invalidated_at is null;
  insert into public.space_operational_handoffs(project_id,space_id,readiness_version,ops_id,assigned_by,reason) values(p_project,s.id,ready.version,ops,auth.uid(),reason) returning id into hid;
  insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'space',s.id,'space.handed_off',jsonb_build_object('handoff',hid,'space_name',s.name,'reason',reason));
  insert into public.notifications(recipient_id,project_id,message) values(ops,p_project,s.name||' is Ordered and pending your handoff acknowledgment.');
 end loop;
 if (select count(distinct x) from unnest(p_spaces) x)<>(select count(*) from public.spaces where id=any(p_spaces) and project_id=p_project and cancelled_at is null) then raise exception 'ACCESS_DENIED'; end if;
end $$;
create function public.handoff_ordered_spaces(p_project uuid,p_spaces uuid[],p_reason text) returns void language sql set search_path='' as $$select private.handoff_ordered_spaces($1,$2,$3)$$;

create function private.acknowledge_space_handoff(p_handoff uuid) returns void language plpgsql security definer set search_path='' as $$
declare h public.space_operational_handoffs;
begin
 perform private.require_role(array['operations_admin','system_administrator']::public.app_role[]);
 select * into h from public.space_operational_handoffs where id=p_handoff;
 perform private.readiness_edit_guard(h.project_id);
 select * into h from public.space_operational_handoffs where id=p_handoff for update;
 if not found or (private.current_role()<>'system_administrator' and h.ops_id<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if h.invalidated_at is not null or not exists(select 1 from public.space_readiness r join public.spaces s on s.id=r.space_id where r.space_id=h.space_id and r.status='Ordered' and r.version=h.readiness_version and s.cancelled_at is null) or not exists(select 1 from public.project_memberships where project_id=h.project_id and user_id=h.ops_id and membership_role='operations_admin' and is_primary) then raise exception 'STALE_HANDOFF'; end if;
 if h.acknowledged_at is not null then return; end if;
 update public.space_operational_handoffs set acknowledged_by=auth.uid(),acknowledged_at=now() where id=h.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),h.project_id,'space',h.space_id,'space.handoff_acknowledged',jsonb_build_object('handoff',h.id,'assigned_ops',h.ops_id));
 insert into public.notifications(recipient_id,project_id,message) values(h.assigned_by,h.project_id,'An Ordered Space handoff has been acknowledged.');
end $$;
create function public.acknowledge_space_handoff(p_handoff uuid) returns void language sql set search_path='' as $$select private.acknowledge_space_handoff($1)$$;
CREATE OR REPLACE FUNCTION private.review_lead(p_id uuid, p_expected_version integer, p_decision lead_status, p_remarks text DEFAULT ''::text, p_primary uuid DEFAULT NULL::uuid, p_support uuid[] DEFAULT '{}'::uuid[], p_ops uuid[] DEFAULT '{}'::uuid[], p_lead_designer uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.leads; old_record jsonb; r public.app_role; project uuid; designer uuid; submission uuid;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select * into l from public.leads where id=p_id for update;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 if r='lead_designer' and not private.can_read_lead(p_id) then raise exception 'ACCESS_DENIED'; end if;
 if p_decision='Accepted' and l.status='Accepted' then select project_id into project from public.project_origins where lead_id=p_id; return project; end if;
 if l.status<>'Submitted' then raise exception 'INVALID_LEAD_STATE'; end if;
 if p_expected_version is null or l.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if p_decision is null or p_decision not in ('Accepted','Returned for Clarification','Rejected') or length(coalesce(p_remarks,''))>4000
 or (p_decision<>'Accepted' and length(trim(coalesce(p_remarks,'')))=0) then raise exception 'REMARKS_REQUIRED'; end if;
 select id into submission from public.lead_submissions where lead_id=p_id and number=l.submission_count;
 if coalesce(cardinality(p_ops),0)>0 then raise exception 'OPERATIONS_ASSIGNMENT_AFTER_CLOSURE'; end if;
 old_record:=to_jsonb(l);
 if p_decision='Accepted' then
   designer:=l.assigned_lead_designer_id;
   if p_lead_designer is not null and p_lead_designer is distinct from designer then raise exception 'INVALID_LEAD_DESIGNER'; end if;
   if designer is null or (r='lead_designer' and p_lead_designer is not null and p_lead_designer<>auth.uid()) then raise exception 'INVALID_LEAD_DESIGNER'; end if;
   perform 1 from public.profiles where id=designer and active and role='lead_designer' for share;
   if not found then raise exception 'INVALID_LEAD_DESIGNER'; end if;
   perform 1 from public.profiles where id=l.bdm_id and active and role='bdm' for share;
   if not found then raise exception 'INVALID_BDM'; end if;
   insert into public.projects(reference,name,lead_designer_id)
   values('ODC-'||to_char(now() at time zone 'Asia/Manila','YYYY')||'-'||lpad(nextval('public.project_reference_seq')::text,6,'0'),l.project_name,designer) returning id into project;
   insert into public.project_origins(project_id,lead_id,primary_bdm_id) values(project,l.id,l.bdm_id);
   insert into public.project_memberships(project_id,user_id,membership_role,is_primary)
   values(project,l.bdm_id,'bdm',true),(project,designer,'lead_designer',true);
   perform private.set_project_assignments(project,p_primary,p_support,p_ops,'Initial assignment on lead acceptance');
 end if;
 insert into public.lead_reviews(lead_id,submission_id,reviewer_id,decision,remarks) values(l.id,submission,auth.uid(),p_decision,trim(coalesce(p_remarks,'')));
 update public.leads set status=p_decision,version=version+1,updated_at=now(),resolved_at=case when p_decision in ('Accepted','Rejected') then now() else null end where id=l.id returning * into l;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),project,'lead',l.id,'lead.reviewed',old_record,to_jsonb(l)||jsonb_build_object('remarks',trim(coalesce(p_remarks,''))));
 insert into public.notifications(recipient_id,lead_id,project_id,message) values(l.bdm_id,l.id,project,'Your lead has been reviewed: '||p_decision::text||'.');
 return project;
end; $function$;

CREATE OR REPLACE FUNCTION private.handoff_closed_project(p_project uuid, p_primary_ops uuid, p_reason text, p_confirm boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; primary_designer uuid; supporters uuid[]; ops uuid[]; handoff uuid;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or (private.current_role()<>'system_administrator' and project.lead_designer_id<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if project.commercial_status<>'Closed' or project.is_cancelled then raise exception 'INVALID_HANDOFF_STATE'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 select user_id into primary_designer from public.project_memberships where project_id=p_project and membership_role='designer' and is_primary;
 select coalesce(array_agg(user_id),'{}'::uuid[]) into supporters from public.project_memberships where project_id=p_project and membership_role='designer' and not is_primary;
 select array[p_primary_ops]||coalesce(array_agg(user_id) filter(where user_id<>p_primary_ops),'{}'::uuid[]) into ops from public.project_memberships where project_id=p_project and membership_role='operations_admin';
 if exists(select 1 from public.project_memberships where project_id=p_project and user_id=p_primary_ops and membership_role='operations_admin' and is_primary) then return p_primary_ops; end if;
 perform private.set_project_assignments(p_project,primary_designer,supporters,ops,p_reason);
 update public.space_operational_handoffs set invalidated_at=now() where project_id=p_project and invalidated_at is null;
 handoff:=p_primary_ops;
 update public.projects set awaiting_handoff=false where id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'project',p_project,'project.operations_assigned',jsonb_build_object('ops_id',p_primary_ops,'reason',trim(p_reason)));
 return handoff;
end $function$;

create or replace function private.assign_project_personnel(p_project uuid,p_primary uuid,p_support uuid[],p_ops uuid[],p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare owner uuid; stage public.commercial_status; oldops uuid[];
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select lead_designer_id,commercial_status into owner,stage from public.projects where id=p_project for update;
 if not found or (private.current_role()<>'system_administrator' and owner<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 select coalesce(array_agg(user_id order by is_primary desc,user_id),'{}') into oldops from public.project_memberships where project_id=p_project and membership_role='operations_admin';
 if stage<>'Closed' and oldops is distinct from coalesce(p_ops,'{}') then raise exception 'OPERATIONS_ASSIGNMENT_AFTER_CLOSURE'; end if;
 perform private.set_project_assignments(p_project,p_primary,p_support,p_ops,p_reason);
 if oldops is distinct from coalesce(p_ops,'{}') then
  update public.space_operational_handoffs set invalidated_at=now() where project_id=p_project and invalidated_at is null;
  if cardinality(p_ops)>0 and stage='Closed' then update public.projects set awaiting_handoff=false where id=p_project; end if;
  insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'project',p_project,'project.operations_assigned',jsonb_build_object('ops_id',p_ops[1],'reason',p_reason));
 end if;
end $$;
CREATE OR REPLACE FUNCTION private.operational_readiness(p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; monitoring public.project_monitoring; blockers jsonb:='[]'; cycle integer;
begin
 if not private.can_read_pipeline(p_project) or (private.current_role()='operations_admin' and not private.logistics_reader(p_project)) then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project;
 select * into monitoring from public.project_monitoring where project_id=p_project;
 select number into cycle from public.project_operational_cycles where project_id=p_project and ended_at is null;
 if project.commercial_status<>'Closed' then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','commercial','label','Commercial Sale must be closed')); end if;
 if monitoring.state<>'Active' or project.is_cancelled then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','lifecycle','label','Project must be Active, not On Hold or Cancelled')); end if;
 if cycle is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','cycle','label','No open operational cycle; completed Projects must be reopened first')); end if;
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','design','id',s.id,'label',s.name||': design '||s.status)) from public.spaces s where s.project_id=p_project and s.cancelled_at is null and s.status<>'Completed'),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','readiness','id',s.id,'label',s.name||': '||coalesce(r.status,'Site Verification'))) from public.spaces s left join public.space_readiness r on r.space_id=s.id where s.project_id=p_project and s.cancelled_at is null and r.status is distinct from 'Ordered'),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','handoff','id',s.id,'label',s.name||': current Space handoff must be acknowledged')) from public.spaces s left join public.space_readiness r on r.space_id=s.id where s.project_id=p_project and s.cancelled_at is null and not exists(select 1 from public.space_operational_handoffs h join public.project_memberships m on m.project_id=h.project_id and m.user_id=h.ops_id and m.membership_role='operations_admin' and m.is_primary where h.space_id=s.id and h.invalidated_at is null and h.acknowledged_at is not null and h.readiness_version=r.version and r.status='Ordered')),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','logistics','id',l.id,'label',l.supplier_name||': logistics '||l.status)) from public.project_logistics l where l.project_id=p_project and l.status not in ('Delivered','Cancelled')),'[]');
 return jsonb_build_object('project_id',p_project,'version',monitoring.version,'cycle',cycle,'ready',jsonb_array_length(blockers)=0,'blockers',blockers,'can_complete',private.space_manager(p_project),'completed',cycle is null and coalesce((select outcome='Completed' from public.project_operational_cycles where project_id=p_project order by number desc limit 1),false),'history',coalesce((select jsonb_agg(jsonb_build_object('cycle',c.cycle_number,'completed_at',c.completed_at,'completed_by',c.completed_by,'reason',c.reason,'administrative_override',c.administrative_override) order by c.cycle_number) from public.operational_completions c where c.project_id=p_project),'[]'));
end $function$;

CREATE OR REPLACE FUNCTION private.complete_operations(p_project uuid, p_version integer, p_cycle integer, p_confirm boolean, p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare readiness jsonb; reason text:=trim(coalesce(p_reason,'')); snapshot jsonb;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.space_manager(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 readiness:=private.operational_readiness(p_project);
 if (readiness->>'cycle') is null then raise exception 'PROJECT_ALREADY_COMPLETED'; end if;
 if (readiness->>'version')::integer is distinct from p_version or (readiness->>'cycle')::integer is distinct from p_cycle then raise exception 'VERSION_CONFLICT'; end if;
 if not (readiness->>'ready')::boolean then raise exception 'OPERATIONAL_PREREQUISITES'; end if;
 if length(reason) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 snapshot:=jsonb_build_object('monitoring',(select jsonb_build_object('deadline',deadline,'timezone',timezone) from public.project_monitoring where project_id=p_project),'readiness',coalesce((select jsonb_agg(to_jsonb(r)) from public.space_readiness r where project_id=p_project),'[]'),'space_handoffs',coalesce((select jsonb_agg(to_jsonb(h)) from public.space_operational_handoffs h where project_id=p_project and invalidated_at is null),'[]'),'spaces',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('installation',to_jsonb(i))) from public.spaces s left join public.space_installations i on i.space_id=s.id where s.project_id=p_project and s.cancelled_at is null),'[]'),'logistics',coalesce((select jsonb_agg(to_jsonb(l)) from public.project_logistics l where l.project_id=p_project),'[]'),'handoff',(select to_jsonb(h) from public.project_handoffs h where h.project_id=p_project and superseded_at is null));
 insert into public.operational_completions(project_id,cycle_number,completed_by,reason,administrative_override,snapshot) values(p_project,p_cycle,auth.uid(),reason,private.current_role()='system_administrator',snapshot);
 update public.project_operational_cycles set ended_at=now(),outcome='Completed' where project_id=p_project and number=p_cycle and ended_at is null;
 update public.project_monitoring set version=version+1 where project_id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'project',p_project,'project.operationally_completed',jsonb_build_object('cycle',p_cycle,'reason',reason,'administrative_override',private.current_role()='system_administrator'));
 insert into public.notifications(recipient_id,project_id,message) select distinct user_id,p_project,'Project operational cycle '||p_cycle||' completed.' from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project and p.active;
end $function$;

alter function private.save_installation(uuid,uuid,integer,text,date,text,boolean) rename to save_installation_legacy;
create function private.save_installation(p_space uuid,p_project uuid,p_version integer,p_status text,p_date date,p_reason text,p_override boolean) returns void language plpgsql security definer set search_path='' as $$begin raise exception 'INSTALLATION_TRACKING_DISABLED'; end $$;
-- Public SQL wrappers may bind their prior function OID; replace explicitly.
create or replace function public.save_installation(p_space uuid,p_project uuid,p_version integer,p_status text,p_date date,p_reason text,p_override boolean default false) returns void language sql set search_path='' as $$select private.save_installation($1,$2,$3,$4,$5,$6,$7)$$;
revoke all on function private.save_installation_legacy(uuid,uuid,integer,text,date,text,boolean) from public,anon,authenticated;
revoke all on function private.change_space_readiness(uuid,integer,text,text) from public,anon;
grant execute on function private.change_space_readiness(uuid,integer,text,text) to authenticated;
revoke all on function public.change_space_readiness(uuid,integer,text,text) from public,anon;
grant execute on function public.change_space_readiness(uuid,integer,text,text) to authenticated;
revoke all on function private.handoff_ordered_spaces(uuid,uuid[],text) from public,anon;
grant execute on function private.handoff_ordered_spaces(uuid,uuid[],text) to authenticated;
revoke all on function public.handoff_ordered_spaces(uuid,uuid[],text) from public,anon;
grant execute on function public.handoff_ordered_spaces(uuid,uuid[],text) to authenticated;
revoke all on function private.acknowledge_space_handoff(uuid) from public,anon;
grant execute on function private.acknowledge_space_handoff(uuid) to authenticated;
revoke all on function public.acknowledge_space_handoff(uuid) from public,anon;
grant execute on function public.acknowledge_space_handoff(uuid) to authenticated;
revoke all on function private.initialize_space_readiness() from public,anon,authenticated;
revoke all on function private.readiness_edit_guard(uuid) from public,anon,authenticated;

-- A curated milestone feed, distinct from detailed/manual Activity history.
create function private.project_milestones(p_project uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_role(enum_range(null::public.app_role));
 if not private.can_read_spaces(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'VALIDATION_ERROR'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
 select * from (
 select e.id,e.action,e.occurred_at,p.display_name actor,
 case e.action
 when 'lead.reviewed' then 'Lead approved and converted to Project'
 when 'project.assignments_changed' then 'Project team assigned'
 when 'commercial.closed' then 'Project commercially Closed'
 when 'project.operations_assigned' then 'Operations Admin assigned'
 when 'space.created' then 'Space created'
 when 'space.status_changed' then 'Space design status updated'
 when 'space.readiness_changed' then 'Space readiness updated'
 when 'space.readiness_rolled_back' then 'Ordered Space rolled back'
 when 'space.handed_off' then 'Ordered Space handed off'
 when 'space.handoff_acknowledged' then 'Space handoff acknowledged'
 when 'handoff.created' then 'Historical project handoff'
 when 'handoff.acknowledged' then 'Historical handoff acknowledged'
 when 'logistics.saved' then 'Supplier order / delivery updated'
 when 'project.operationally_completed' then 'Project completed'
 when 'project.reopen' then 'Project reopened'
 else e.action end title,
 case when e.entity_type='space' then coalesce(e.new_value->>'name',e.new_value->>'space_name',(select name from public.spaces where id=e.entity_id),'Space')||' · ' else '' end ||
 coalesce(e.new_value->>'readiness_status',e.new_value->>'status',e.new_value->>'reason','') detail
 from public.audit_events e left join public.profiles p on p.id=e.actor_id
 where e.project_id=p_project and (
 e.action in ('lead.reviewed','project.assignments_changed','commercial.closed','project.operations_assigned','space.created','space.readiness_changed','space.readiness_rolled_back','space.handed_off','space.handoff_acknowledged','handoff.created','handoff.acknowledged','project.operationally_completed','project.reopen')
 or (e.action='space.status_changed' and e.new_value->>'status' in ('Submitted','Completed','For Revision'))
 or (e.action='logistics.saved' and e.new_value->>'status' in ('RFP','For Manufacturing','For Delivery','Delivered') and e.previous_value->>'status' is distinct from e.new_value->>'status'))
 union all select s.id,'lead.endorsed',s.submitted_at,p.display_name,'Lead endorsed for review','Submission '||s.number from public.lead_submissions s join public.project_origins o on o.lead_id=s.lead_id left join public.profiles p on p.id=s.submitted_by where o.project_id=p_project and private.current_role()<>'operations_admin'
 ) milestones order by occurred_at desc,id desc limit 20 offset p_offset
 ) x;
 return result;
end $$;
create function public.project_milestones(p_project uuid,p_offset integer default 0) returns jsonb language sql set search_path='' as $$select private.project_milestones($1,$2)$$;
revoke all on function private.project_milestones(uuid,integer),public.project_milestones(uuid,integer) from public,anon;
grant execute on function private.project_milestones(uuid,integer),public.project_milestones(uuid,integer) to authenticated;

CREATE OR REPLACE FUNCTION private.role_dashboard(p_view text DEFAULT ''::text, p_page integer DEFAULT 1)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare actor uuid:=auth.uid(); viewer_role public.app_role:=private.current_role(); result jsonb;
begin
 if actor is null or viewer_role is null then raise exception 'ACCESS_DENIED'; end if;
 if p_page is null or p_page not between 1 and 100000 or p_view is null or length(p_view)>80 then raise exception 'VALIDATION_ERROR'; end if;
 with
 ctx as (select (now() at time zone 'Asia/Manila')::date today),
 projects as materialized (
  select p.*,m.timezone,m.deadline,m.state,
   (now() at time zone coalesce(m.timezone,'Asia/Manila'))::date today,
   exists(select 1 from public.project_operational_cycles c where c.project_id=p.id and c.ended_at is null) open_cycle
  from public.projects p left join public.project_monitoring m on m.project_id=p.id
  where private.can_read_pipeline(p.id)
 ),
 active as materialized (select * from projects where commercial_status<>'Lost' and not is_cancelled and not is_operationally_completed and open_cycle),
 design_spaces as materialized (
  select s.*,p.name project_name,p.timezone,p.today,p.commercial_status,p.created_at project_created_at,
   greatest(s.last_progress_at,(select max(a.activity_date::timestamp at time zone p.timezone) from public.project_activities a where a.space_id=s.id and a.category in ('Design Work','Revision','Site Visit'))) progress_at
  from public.spaces s join active p on p.id=s.project_id
  where viewer_role in ('lead_designer','designer') and s.cancelled_at is null
 ),
 personal as materialized (select * from design_spaces s where viewer_role='designer' and (s.primary_designer_id=actor or exists(select 1 from public.space_supporters ss where ss.space_id=s.id and ss.user_id=actor))),
 project_risk as materialized (select p.id,p.name,p.created_at,private.dashboard_project_risk(p.id) risk from active p where viewer_role='lead_designer'),
 ops as materialized (select * from active where viewer_role='operations_admin' and commercial_status='Closed'),
 ops_records as materialized (select l.*,p.today,p.timezone,p.name project_name from public.project_logistics l join ops p on p.id=l.project_id),
 source as (
  -- Account KPIs contain profile IDs/names only. No Auth metadata is returned.
  select case when p.active then 'active_users' else 'inactive_users' end key,p.id,p.display_name label,'/dashboard/users' href,p.role::text detail,null::numeric amount,p.created_at at
   from public.profiles p where viewer_role='system_administrator'
  union all select 'invitations',p.id,p.display_name,'/dashboard/users','Invited; no recorded sign-in',null,p.created_at from public.profiles p join auth.users u on u.id=p.id where viewer_role='system_administrator' and u.invited_at is not null and u.last_sign_in_at is null
  union all select 'access_alerts',p.id,p.display_name,'/dashboard/users','Inactive access',null,p.created_at from public.profiles p where viewer_role='system_administrator' and not p.active
  union all select 'system_activity',a.id,a.action,'/dashboard/users','Recorded system event (values omitted)',null,a.occurred_at from public.audit_events a,ctx where viewer_role='system_administrator' and (a.occurred_at at time zone 'Asia/Manila')::date between ctx.today-13 and ctx.today
  -- Lead Designer: current scoped workload and historical completion dates.
  union all select 'active_projects',p.id,p.name,'/dashboard/projects/'||p.id,'Active operational cycle · '||coalesce(p.state,'Active'),null,p.created_at from active p where viewer_role='lead_designer'
  union all select case when r.risk='Overdue' then 'overdue_projects' else 'risk_projects' end,r.id,r.name,'/dashboard/projects/'||r.id,r.risk,null,r.created_at from project_risk r where r.risk in ('Overdue','At Risk')
  union all select 'attention_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text||coalesce(' · Due '||s.deadline::text,''),null,s.updated_at from design_spaces s where viewer_role='lead_designer' and s.status<>'Completed' and (s.status in ('Submitted','For Revision','On Hold') or private.dashboard_risk(s.deadline,(s.progress_at at time zone s.timezone)::date,s.today)<>'On Track')
  union all select 'quotation_reviews',v.id,p.name||' · Quotation '||v.number,'/dashboard/projects/'||p.id||'?tab=quotation&version='||v.id,'Submitted for Review',null,v.submitted_at from public.quotation_versions v join projects p on p.id=v.project_id where viewer_role='lead_designer' and not p.is_cancelled and p.commercial_status<>'Lost' and v.state='Submitted for Review'
  union all select 'recent_completed',p.id,p.name,'/dashboard/projects/'||p.id,'Last operational completion · '||c.completed_at::text||' · Current: '||case when p.is_cancelled then 'Cancelled' when p.is_operationally_completed then 'Completed' else coalesce(p.state,'Active') end,null,c.completed_at from projects p join lateral(select * from public.operational_completions c where c.project_id=p.id order by cycle_number desc limit 1)c on true where viewer_role='lead_designer' and (c.completed_at at time zone p.timezone)::date between p.today-13 and p.today
  -- Designer metrics use EXISTS, never supporter joins which duplicate Spaces.
  union all select 'assigned_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text,null,s.updated_at from personal s where s.status<>'Completed'
  union all select 'due_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,'Due '||s.deadline::text,null,s.updated_at from personal s where s.status<>'Completed' and s.deadline between s.today and s.today+3
  union all select 'overdue_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,'Overdue · Due '||s.deadline::text,null,s.updated_at from personal s where s.status<>'Completed' and s.deadline<s.today
  union all select 'revision_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,'For Revision',null,s.updated_at from personal s where s.status='For Revision'
  union all select 'design_tasks',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text,null,s.updated_at from personal s where s.status<>'Completed'
  -- BDM: own Leads and related Projects, Sale-only aggregate.
  union all select 'submitted_leads',l.id,l.project_name,'/dashboard/leads/'||l.id,l.status::text,null,l.updated_at from public.leads l where viewer_role='bdm' and l.bdm_id=actor and l.first_submitted_at is not null
  union all select case l.status when 'Submitted' then 'awaiting_leads' when 'Returned for Clarification' then 'clarification_leads' when 'Accepted' then 'accepted_leads' else 'rejected_leads' end,l.id,l.project_name,'/dashboard/leads/'||l.id,l.status::text,null,l.updated_at from public.leads l where viewer_role='bdm' and l.bdm_id=actor and l.status in ('Submitted','Returned for Clarification','Accepted','Rejected')
  union all select 'commercial_opportunities',p.id,p.name,'/dashboard/projects/'||p.id,p.commercial_status::text,null,p.created_at from active p where viewer_role='bdm' and p.commercial_status<>'Closed'
  union all select 'closed_projects',p.id,p.name,'/dashboard/projects/'||p.id,'Closed',null,p.created_at from projects p where viewer_role='bdm' and not p.is_cancelled and p.commercial_status='Closed'
  union all select 'sale',p.id,p.name,'/dashboard/projects/'||p.id||'?tab=finance','Authorized Sale · PHP '||v.amount::text,v.amount,p.created_at from projects p join public.project_financial_values v on v.project_id=p.id and v.kind='Sale' where viewer_role='bdm' and not p.is_cancelled
  -- Operations: no pre-close metadata, quotation, Sale or derived finances.
  union all select 'handoffs',h.id,p.name,'/dashboard/projects/'||p.id||'?tab=operations','Ordered Space pending acknowledgment',null,h.assigned_at from public.space_operational_handoffs h join ops p on p.id=h.project_id join public.spaces s on s.id=h.space_id where h.invalidated_at is null and h.acknowledged_at is null and h.ops_id=actor and s.cancelled_at is null
  union all select 'operational_projects',p.id,p.name,'/dashboard/projects/'||p.id,'Closed · Active operational cycle',null,p.created_at from ops p
  union all select 'logistics:'||l.status,l.id,l.supplier_name||' · '||l.project_name,'/dashboard/projects/'||l.project_id||'?tab=logistics#logistics-'||l.id,l.status,null,l.status_at from ops_records l where l.status<>'Cancelled'
  union all select 'delayed_logistics',l.id,l.supplier_name||' · '||l.project_name,'/dashboard/projects/'||l.project_id||'?tab=logistics#logistics-'||l.id,'No stage change for '||(l.today-(l.status_at at time zone l.timezone)::date)||' calendar days · '||l.status,null,l.status_at from ops_records l where l.status not in ('Delivered','Cancelled') and (l.status_at at time zone l.timezone)::date<=l.today-7
  union all select 'recent_delivered',p.id,p.name,'/dashboard/projects/'||p.id||'?tab=logistics','All non-cancelled logistics Delivered',null,(select max(l.status_at) from public.project_logistics l where l.project_id=p.id and l.status='Delivered') from projects p where viewer_role='operations_admin' and p.commercial_status='Closed' and not p.is_cancelled and exists(select 1 from public.project_logistics l where l.project_id=p.id and l.status='Delivered' and (l.status_at at time zone p.timezone)::date between p.today-13 and p.today) and not exists(select 1 from public.project_logistics l where l.project_id=p.id and l.status not in ('Delivered','Cancelled'))
 ),
 totals as (select key,count(*) count,case when key='sale' then sum(amount)::text end amount from source group by key),
 selected as (select id,label,href,detail,at from source where key=p_view order by at desc,id limit 25 offset (p_page-1)*25),
 action_rows as (select distinct on (id) id,label,href,detail,at from source where key in ('access_alerts','invitations','quotation_reviews','attention_spaces','overdue_spaces','due_spaces','design_tasks','revision_spaces','clarification_leads','awaiting_leads','handoffs','delayed_logistics','ops_installations','installation_tasks') order by id,at desc),
 workload as (
  select person.id,person.display_name,count(distinct s.id) count from design_spaces s
  join public.profiles person on person.active and person.role='designer' and exists(select 1 from public.project_memberships pm where pm.project_id=s.project_id and pm.user_id=person.id and pm.membership_role='designer') and (person.id=s.primary_designer_id or exists(select 1 from public.space_supporters ss where ss.space_id=s.id and ss.user_id=person.id))
  where viewer_role='lead_designer' and s.status<>'Completed' group by person.id,person.display_name
 ),
 workload_page as(select * from workload order by count desc,id limit 25 offset (case when p_view='workload' then (p_page-1)*25 else 0 end)),
 recent as (
  select n.id,n.message label,case when n.project_id is not null and private.can_read_pipeline(n.project_id) then '/dashboard/projects/'||n.project_id else '/dashboard/notifications' end href,n.created_at at from public.notifications n where viewer_role<>'system_administrator' and n.recipient_id=actor
  union all select a.id,a.action,'/dashboard/users',a.occurred_at from public.audit_events a where viewer_role='system_administrator'
 )
 select jsonb_build_object('role',viewer_role,'as_of',now(),'timezone','Asia/Manila','metrics',coalesce((select jsonb_object_agg(key,jsonb_build_object('count',count,'amount',amount)) from totals),'{}'),
  'view',p_view,'page',p_page,'records',coalesce((select jsonb_agg(to_jsonb(s)) from selected s),'[]'),
  'actions',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from action_rows order by at desc,id limit 8)a),'[]'),
  'recent',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from recent order by at desc,id limit 8)r),'[]'),
  'workload',coalesce((select jsonb_agg(to_jsonb(w)) from workload_page w),'[]'),
  'workload_count',(select count(*) from workload),
  'unread',(select count(*) from public.notifications n where n.recipient_id=actor and n.read_at is null)) into result;
 if p_view<>'' and p_view<>'workload' and not exists(select 1 from jsonb_object_keys(result->'metrics') k where k=p_view) then
  -- Empty authorized metrics are valid; unknown/foreign metrics cannot leak records.
  result:=jsonb_set(result,'{records}','[]');
 end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION public.workspace_calendar(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'ACCESS_DENIED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'INVALID_RANGE'; end if;
 with events as (
 select 'project:'||p.id as id,'Project deadline'::text as kind,p.name as title,p.reference as subtitle,m.deadline as date,m.deadline as end_date,null::time as time,null::time as end_time,'/dashboard/projects/'||p.id as href,case when p.is_operationally_completed then 'Completed' else m.state end as status,m.timezone,0 as version,''::text as notes,''::text as location
 from public.projects p join public.project_monitoring m on m.project_id=p.id where p.commercial_status<>'Lost' and not p.is_cancelled and m.deadline between p_from and p_to
 union all
 select 'space:'||s.id,'Space deadline',s.name,p.name,s.deadline,s.deadline,null,null,'/dashboard/projects/'||p.id||'#space-'||s.id,s.status::text,m.timezone,0,'',''
 from public.spaces s join public.projects p on p.id=s.project_id join public.project_monitoring m on m.project_id=p.id where p.commercial_status<>'Lost' and s.cancelled_at is null and not p.is_cancelled and s.deadline between p_from and p_to
union all
 select 'handoff:'||p.id,'Expected handoff',p.name,p.reference,p.expected_handoff,p.expected_handoff,null,null,'/dashboard/projects/'||p.id,p.commercial_status::text,'Asia/Manila',0,'',''
 from public.projects p where p.commercial_status<>'Lost' and not p.is_cancelled and p.expected_handoff between p_from and p_to
 union all
 select 'lead:'||l.id,'Lead requested date',l.project_name,l.reference,l.date_needed,l.date_needed,null,null,'/dashboard/leads/'||l.id,l.status::text,'Asia/Manila',0,'',''
 from public.leads l where l.status in ('Draft','Submitted','Returned for Clarification') and l.date_needed between p_from and p_to
 union all
 select e.id::text,'Personal event',e.title,case when e.owner_id=auth.uid() then 'Your event' else coalesce((select p.display_name from public.profiles p where p.id=e.owner_id),'Other user')||' · Personal event' end,e.event_date,e.end_date,e.start_time,e.end_time,null,'Scheduled','Asia/Manila',e.version,e.notes,e.location
 from public.calendar_events e where e.cancelled_at is null and e.event_date<=p_to and e.end_date>=p_from
 ) select coalesce(jsonb_agg(to_jsonb(e) order by e.date,e.time nulls first,e.kind,e.title,e.id),'[]'::jsonb) into result from events e;
 return result;
end $function$;

revoke all on function private.save_installation(uuid,uuid,integer,text,date,text,boolean) from public,anon;
grant execute on function private.save_installation(uuid,uuid,integer,text,date,text,boolean) to authenticated;
