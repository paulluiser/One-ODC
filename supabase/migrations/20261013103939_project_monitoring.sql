-- Monitoring remains independent of commercial and future delivery/installation states.
alter table public.projects add column is_cancelled boolean not null default false;
create table public.project_monitoring (
 project_id uuid primary key references public.projects(id), timezone text not null default 'Asia/Manila',
 deadline date, original_deadline date, state text not null default 'Active' check(state in ('Active','On Hold','Cancelled')),
 version integer not null default 1, cancelled_at timestamptz, cancellation_reason text
);
create table public.project_operational_cycles (
 project_id uuid not null references public.projects(id), number integer not null, started_at timestamptz not null,
 ended_at timestamptz, outcome text check(outcome in ('Completed','Cancelled')), primary key(project_id,number),
 check((ended_at is null)=(outcome is null)),check(ended_at is null or ended_at>=started_at)
);
create unique index project_open_cycle on public.project_operational_cycles(project_id) where ended_at is null;
create table public.project_holds (
 id uuid primary key default gen_random_uuid(),project_id uuid not null references public.projects(id),
 started_at timestamptz not null default now(), started_by uuid not null references public.profiles(id), reason text not null,
 ended_at timestamptz, ended_by uuid references public.profiles(id), resume_reason text,
 check(ended_at is null or ended_at>=started_at)
);
create unique index project_active_hold on public.project_holds(project_id) where ended_at is null;
create index project_holds_starter on public.project_holds(started_by);
create index project_holds_ender on public.project_holds(ended_by);
create table public.project_site_coordinators (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 name text not null check(length(trim(name)) between 1 and 200), active boolean not null default true,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now()
);
create index coordinator_project on public.project_site_coordinators(project_id);
create index coordinator_creator on public.project_site_coordinators(created_by);
create table public.project_activities (
 id uuid primary key,project_id uuid not null references public.projects(id),space_id uuid references public.spaces(id),
 category text not null check(category in ('Design Work','Client Coordination','Site Visit','Revision','Supplier Update','Installation','General Update')),
 activity_date date not null, description text not null check(length(trim(description)) between 1 and 4000),
 coordinator_id uuid references public.project_site_coordinators(id), attachment_versions uuid[] not null default '{}',
 created_by uuid not null references public.profiles(id),recorded_at timestamptz not null default now(),updated_at timestamptz not null default now(),version integer not null default 1
);
create index activity_project_date on public.project_activities(project_id,activity_date desc);
create index activity_space on public.project_activities(space_id);
create index activity_creator on public.project_activities(created_by);
create index activity_coordinator on public.project_activities(coordinator_id);
create table public.project_activity_versions (
 activity_id uuid not null references public.project_activities(id),project_id uuid not null references public.projects(id),
 number integer not null,snapshot jsonb not null,actor_id uuid not null references public.profiles(id),reason text not null,recorded_at timestamptz not null default now(), primary key(activity_id,number)
);
create index activity_version_project on public.project_activity_versions(project_id);
create index activity_version_actor on public.project_activity_versions(actor_id);
create trigger activity_versions_immutable before update or delete on public.project_activity_versions for each row execute function private.reject_audit_mutation();

create function private.can_read_monitoring(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_pipeline(p_project) and (private.current_role()<>'operations_admin' or exists(select 1 from public.projects where id=p_project and commercial_status='Closed'))
$$;
create function private.can_read_activity(p_project uuid,p_category text) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_monitoring(p_project) and case private.current_role()
 when 'bdm' then p_category in ('Client Coordination','General Update')
 when 'designer' then p_category in ('Design Work','Client Coordination','Site Visit','Revision','General Update')
 when 'operations_admin' then p_category in ('Client Coordination','Supplier Update','Installation','General Update') else true end
$$;
revoke all on function private.can_read_monitoring(uuid),private.can_read_activity(uuid,text) from public,anon;
grant execute on function private.can_read_monitoring(uuid),private.can_read_activity(uuid,text) to authenticated;
alter table public.project_monitoring enable row level security;
alter table public.project_operational_cycles enable row level security;
alter table public.project_holds enable row level security;
alter table public.project_site_coordinators enable row level security;
alter table public.project_activities enable row level security;
alter table public.project_activity_versions enable row level security;
revoke all on public.project_monitoring,public.project_operational_cycles,public.project_holds,public.project_site_coordinators,public.project_activities,public.project_activity_versions from anon,authenticated;
grant select on public.project_monitoring,public.project_operational_cycles,public.project_holds,public.project_site_coordinators,public.project_activities,public.project_activity_versions to authenticated;
create policy monitoring_read on public.project_monitoring for select to authenticated using(private.can_read_monitoring(project_id));
create policy cycle_read on public.project_operational_cycles for select to authenticated using(private.can_read_monitoring(project_id));
create policy hold_read on public.project_holds for select to authenticated using(private.can_read_monitoring(project_id));
create policy coordinator_read on public.project_site_coordinators for select to authenticated using(private.can_read_monitoring(project_id));
create policy activity_read on public.project_activities for select to authenticated using(private.can_read_activity(project_id,category));
create policy activity_version_read on public.project_activity_versions for select to authenticated using(private.can_read_activity(project_id,snapshot->>'category'));

create function private.initialize_monitoring() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.project_monitoring(project_id,deadline,original_deadline) values(new.id,new.expected_handoff,new.expected_handoff);
 insert into public.project_operational_cycles(project_id,number,started_at) values(new.id,1,new.created_at);
 return new;
end; $$;
revoke all on function private.initialize_monitoring() from public,anon,authenticated;
insert into public.project_monitoring(project_id,deadline,original_deadline) select id,expected_handoff,expected_handoff from public.projects;
insert into public.project_operational_cycles(project_id,number,started_at) select id,1,created_at from public.projects;
create trigger initialize_project_monitoring after insert on public.projects for each row execute function private.initialize_monitoring();
alter table public.spaces add column original_deadline date,add column work_started_at timestamptz,add column cycle_started_at timestamptz,add column cycle_completed_at timestamptz,add column last_progress_at timestamptz;
update public.spaces s set original_deadline=(select (e.new_value->>'deadline')::date from public.space_events e where e.space_id=s.id and e.action='space.created' order by occurred_at,id limit 1),
 work_started_at=(select min(occurred_at) from public.space_events e where e.space_id=s.id and e.action='space.status_changed' and e.new_value->>'status' in ('In Progress','Submitted','For Revision','Completed')),
 cycle_started_at=(select min(occurred_at) from public.space_events e where e.space_id=s.id and e.action='space.status_changed' and (e.new_value->>'revision_number')::integer=s.revision_number and e.new_value->>'status' in ('In Progress','Submitted','For Revision','Completed')),
 cycle_completed_at=case when status='Completed' then last_completed_at else null end,
 last_progress_at=coalesce((select max(occurred_at) from public.space_events e where e.space_id=s.id and e.action='space.status_changed' and e.new_value->>'status'<>'On Hold'),s.created_at);
create function private.monitor_space_change() returns trigger language plpgsql security definer set search_path='' as $$
declare state text;
begin
 select m.state into state from public.project_monitoring m where m.project_id=new.project_id;
 if state='Cancelled' then raise exception 'PROJECT_CANCELLED'; end if;
 if tg_op='INSERT' then new.original_deadline:=new.deadline;new.last_progress_at:=now();
 else
  new.original_deadline:=old.original_deadline;
  if old.status is distinct from new.status then
   if state='On Hold' then raise exception 'PROJECT_ON_HOLD'; end if;
   if new.status in ('In Progress','Submitted','For Revision','Completed') then new.work_started_at:=coalesce(old.work_started_at,now());new.cycle_started_at:=case when new.revision_number>old.revision_number then now() else coalesce(old.cycle_started_at,now()) end;new.last_progress_at:=now();end if;
   if new.status='Completed' then new.cycle_completed_at:=now();elsif old.status='Completed' then new.cycle_completed_at:=null;end if;
  end if;
 end if;
 return new;
end; $$;
revoke all on function private.monitor_space_change() from public,anon,authenticated;
create trigger monitor_space_change before insert or update on public.spaces for each row execute function private.monitor_space_change();

-- END SCHEMA
create function private.control_project(p_project uuid,p_version integer,p_action text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.project_monitoring; previous jsonb;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.space_manager(p_project) then raise exception 'ACCESS_DENIED';end if;
 select * into m from public.project_monitoring where project_id=p_project for update;
 if not found or m.version is distinct from p_version then raise exception 'VERSION_CONFLICT';end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 if m.state='Cancelled' then raise exception 'PROJECT_CANCELLED';end if;
 if p_action<>'Reopen' and not exists(select 1 from public.project_operational_cycles where project_id=p_project and ended_at is null) then raise exception 'PROJECT_RESOLVED';end if;
 previous:=to_jsonb(m);
 if p_action='Reopen' then
  if exists(select 1 from public.project_operational_cycles where project_id=p_project and ended_at is null) or not exists(select 1 from public.project_operational_cycles where project_id=p_project and outcome='Completed') then raise exception 'INVALID_TRANSITION';end if;
  insert into public.project_operational_cycles(project_id,number,started_at) select p_project,max(number)+1,now() from public.project_operational_cycles where project_id=p_project;
  update public.project_monitoring set state='Active',version=version+1 where project_id=p_project;
 elsif p_action='Hold' and m.state='Active' then
  insert into public.project_holds(project_id,started_by,reason) values(p_project,auth.uid(),trim(p_reason));
  update public.project_monitoring set state='On Hold',version=version+1 where project_id=p_project;
 elsif p_action='Resume' and m.state='On Hold' then
  update public.project_holds set ended_at=now(),ended_by=auth.uid(),resume_reason=trim(p_reason) where project_id=p_project and ended_at is null;
  if not found then raise exception 'INVALID_TRANSITION';end if;
  update public.project_monitoring set state='Active',version=version+1 where project_id=p_project;
 elsif p_action='Cancel' then
  update public.project_holds set ended_at=now(),ended_by=auth.uid(),resume_reason='Project cancelled: '||trim(p_reason) where project_id=p_project and ended_at is null;
  update public.project_monitoring set state='Cancelled',cancelled_at=now(),cancellation_reason=trim(p_reason),version=version+1 where project_id=p_project;
  update public.project_operational_cycles set ended_at=now(),outcome='Cancelled' where project_id=p_project and ended_at is null;
  update public.projects set is_cancelled=true where id=p_project;
 else raise exception 'INVALID_TRANSITION';end if;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) select auth.uid(),p_project,'project',p_project,'project.'||lower(p_action),previous,to_jsonb(n)||jsonb_build_object('reason',trim(p_reason)) from public.project_monitoring n where project_id=p_project;
end; $$;
create function private.revise_project_deadline(p_project uuid,p_version integer,p_deadline date,p_timezone text,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare m public.project_monitoring;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.space_manager(p_project) then raise exception 'ACCESS_DENIED';end if;
 select * into m from public.project_monitoring where project_id=p_project for update;
 if m.version is distinct from p_version then raise exception 'VERSION_CONFLICT';end if;
 if m.state='Cancelled' then raise exception 'PROJECT_CANCELLED';end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_timezone) then raise exception 'VALIDATION_ERROR';end if;
 update public.project_monitoring set deadline=p_deadline,timezone=p_timezone,version=version+1 where project_id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) select auth.uid(),p_project,'project',p_project,'project.deadline_revised',to_jsonb(m),to_jsonb(n)||jsonb_build_object('reason',trim(p_reason)) from public.project_monitoring n where project_id=p_project;
end; $$;
create function private.add_site_coordinator(p_project uuid,p_name text,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare id uuid;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where projects.id=p_project for update;
 if not found or not private.space_manager(p_project) then raise exception 'ACCESS_DENIED';end if;
 if length(trim(coalesce(p_name,''))) not between 1 and 200 or length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'VALIDATION_ERROR';end if;
 insert into public.project_site_coordinators(project_id,name,created_by) values(p_project,trim(p_name),auth.uid()) returning project_site_coordinators.id into id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'site_coordinator',id,'coordinator.created',jsonb_build_object('name',trim(p_name),'reason',trim(p_reason)));
 return id;
end; $$;
create function private.save_project_activity(p_id uuid,p_project uuid,p_version integer,p_space uuid,p_category text,p_date date,p_description text,p_coordinator uuid,p_attachments uuid[],p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare a public.project_activities; r public.app_role; manager boolean; v uuid; class text; previous jsonb;
begin
 r:=private.require_role(array['designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.can_read_activity(p_project,p_category) then raise exception 'ACCESS_DENIED';end if;
 manager:=private.space_manager(p_project);
 if not manager and r='lead_designer' and not private.can_read_spaces(p_project) then raise exception 'ACCESS_DENIED';end if;
 if p_space is not null and not exists(select 1 from public.spaces where id=p_space and project_id=p_project) then raise exception 'ACCESS_DENIED';end if;
 if p_space is not null and not manager and r<>'operations_admin' and not coalesce(private.space_editor(p_space),false) then raise exception 'ACCESS_DENIED';end if;
 if p_coordinator is not null and not exists(select 1 from public.project_site_coordinators where id=p_coordinator and project_id=p_project and active) then raise exception 'VALIDATION_ERROR';end if;
 if p_category not in ('Design Work','Client Coordination','Site Visit','Revision','Supplier Update','Installation','General Update') or p_category is null or p_date is null or p_date>(select (now() at time zone timezone)::date from public.project_monitoring where project_id=p_project) or length(trim(coalesce(p_description,''))) not between 1 and 4000 or length(trim(coalesce(p_reason,''))) not between 1 and 2000 or p_attachments is null or cardinality(p_attachments)>5 then raise exception 'VALIDATION_ERROR';end if;
 for v in select distinct x from unnest(p_attachments) x order by x loop
  select t.classification into class from public.attachment_versions av join public.attachments t on t.id=av.attachment_id where av.id=v and t.project_id=p_project and t.archived_at is null and av.ready_at is not null for share of av,t;
  if not found or not private.can_read_attachment((select attachment_id from public.attachment_versions where id=v)) then raise exception 'ACCESS_DENIED';end if;
  if (p_category in ('Client Coordination','General Update') and class<>'general') or (p_category in ('Design Work','Site Visit','Revision') and class not in ('general','design')) or (p_category in ('Supplier Update','Installation') and class not in ('general','operations')) then raise exception 'ACCESS_DENIED';end if;
 end loop;
 select * into a from public.project_activities where id=p_id for update;
 if found then
  if a.project_id<>p_project or not private.can_read_activity(p_project,a.category) or (not manager and a.created_by<>auth.uid()) then raise exception 'ACCESS_DENIED';end if;
  if a.version is distinct from p_version then raise exception 'VERSION_CONFLICT';end if;
  previous:=to_jsonb(a);
  update public.project_activities set space_id=p_space,category=p_category,activity_date=p_date,description=trim(p_description),coordinator_id=p_coordinator,attachment_versions=p_attachments,version=version+1,updated_at=now() where id=p_id;
 else
  if p_version is distinct from 0 or p_id is null then raise exception 'VERSION_CONFLICT';end if;
  if exists(select 1 from public.project_monitoring where project_id=p_project and state='Cancelled') then raise exception 'PROJECT_CANCELLED';end if;
  insert into public.project_activities(id,project_id,space_id,category,activity_date,description,coordinator_id,attachment_versions,created_by) values(p_id,p_project,p_space,p_category,p_date,trim(p_description),p_coordinator,p_attachments,auth.uid());
 end if;
 insert into public.project_activity_versions(activity_id,project_id,number,snapshot,actor_id,reason) select id,project_id,version,to_jsonb(n),auth.uid(),trim(p_reason) from public.project_activities n where id=p_id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) select auth.uid(),p_project,'project_activity',p_id,case when previous is null then 'activity.created' else 'activity.corrected' end,previous,to_jsonb(n)||jsonb_build_object('reason',trim(p_reason)) from public.project_activities n where id=p_id;
 return p_id;
end; $$;
-- END MUTATIONS
create function private.monitoring_summary(p_projects uuid[]) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_role(enum_range(null::public.app_role));
 if cardinality(p_projects)>25 then raise exception 'VALIDATION_ERROR';end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
 select m.*,p.created_at,
 (select min(s.deadline) from public.spaces s where s.project_id=m.project_id and s.cancelled_at is null and s.status<>'Completed') earliest_space_deadline,
 (select min(greatest(s.last_progress_at,(select max(a.activity_date::timestamp at time zone m.timezone) from public.project_activities a where a.space_id=s.id and a.category in ('Design Work','Revision','Site Visit')))) from public.spaces s where s.project_id=m.project_id and s.cancelled_at is null and s.status<>'Completed') oldest_space_progress_at,
 (select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'editable',s.cancelled_at is null and (private.current_role()='operations_admin' or coalesce(private.space_editor(s.id),false))) order by s.created_at,s.id),'[]') from public.spaces s where s.project_id=m.project_id) space_refs,
 (select count(*) from public.spaces s where s.project_id=m.project_id and s.cancelled_at is null) active_spaces,
 (select count(*) from public.spaces s where s.project_id=m.project_id and s.cancelled_at is null and s.status='Completed') completed_spaces,
 (select max(c.ended_at) from public.project_operational_cycles c where c.project_id=m.project_id) last_cycle_ended_at,
 (select coalesce(jsonb_agg(to_jsonb(c) order by number),'[]') from public.project_operational_cycles c where c.project_id=m.project_id) cycles,
 (select coalesce(jsonb_agg(jsonb_build_object('started_at',h.started_at,'ended_at',h.ended_at) order by started_at),'[]') from public.project_holds h where h.project_id=m.project_id) holds,
 greatest(p.created_at,(select max(s.last_progress_at) from public.spaces s where s.project_id=m.project_id and s.cancelled_at is null),(select max(a.activity_date::timestamp at time zone m.timezone) from public.project_activities a where a.project_id=m.project_id and a.category in ('Design Work','Revision','Site Visit','Supplier Update','Installation'))) last_progress_at
 from public.project_monitoring m join public.projects p on p.id=m.project_id where m.project_id=any(p_projects) and private.can_read_monitoring(m.project_id)
 ) x;
 return result;
end; $$;
create function private.project_timeline(p_project uuid,p_category text default '',p_from date default null,p_to date default null,p_actor uuid default null,p_space uuid default null,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
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
 ) t where (coalesce(p_category,'')='' or t.category=p_category) and (p_from is null or t.date>=p_from) and (p_to is null or t.date<=p_to) and (p_actor is null or t.actor_id=p_actor) and (p_space is null or t.space_id=p_space) order by occurred_at desc,recorded_at desc,id limit 50 offset p_offset
 ) x;return result;
end; $$;

create function public.control_project(p_project uuid,p_version integer,p_action text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.control_project(p_project,p_version,p_action,p_reason)$$;
create function public.revise_project_deadline(p_project uuid,p_version integer,p_deadline date,p_timezone text,p_reason text) returns void language sql security invoker set search_path='' as $$select private.revise_project_deadline(p_project,p_version,p_deadline,p_timezone,p_reason)$$;
create function public.add_site_coordinator(p_project uuid,p_name text,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.add_site_coordinator(p_project,p_name,p_reason)$$;
create function public.save_project_activity(p_id uuid,p_project uuid,p_version integer,p_space uuid,p_category text,p_date date,p_description text,p_coordinator uuid,p_attachments uuid[],p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.save_project_activity(p_id,p_project,p_version,p_space,p_category,p_date,p_description,p_coordinator,p_attachments,p_reason)$$;
create function public.monitoring_summary(p_projects uuid[]) returns jsonb language sql security invoker set search_path='' as $$select private.monitoring_summary(p_projects)$$;
create function public.project_timeline(p_project uuid,p_category text default '',p_from date default null,p_to date default null,p_actor uuid default null,p_space uuid default null,p_offset integer default 0) returns jsonb language sql security invoker set search_path='' as $$select private.project_timeline(p_project,p_category,p_from,p_to,p_actor,p_space,p_offset)$$;
revoke all on function private.control_project(uuid,integer,text,text),private.revise_project_deadline(uuid,integer,date,text,text),private.add_site_coordinator(uuid,text,text),private.save_project_activity(uuid,uuid,integer,uuid,text,date,text,uuid,uuid[],text),private.monitoring_summary(uuid[]),private.project_timeline(uuid,text,date,date,uuid,uuid,integer),public.control_project(uuid,integer,text,text),public.revise_project_deadline(uuid,integer,date,text,text),public.add_site_coordinator(uuid,text,text),public.save_project_activity(uuid,uuid,integer,uuid,text,date,text,uuid,uuid[],text),public.monitoring_summary(uuid[]),public.project_timeline(uuid,text,date,date,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function private.control_project(uuid,integer,text,text),private.revise_project_deadline(uuid,integer,date,text,text),private.add_site_coordinator(uuid,text,text),private.save_project_activity(uuid,uuid,integer,uuid,text,date,text,uuid,uuid[],text),private.monitoring_summary(uuid[]),private.project_timeline(uuid,text,date,date,uuid,uuid,integer),public.control_project(uuid,integer,text,text),public.revise_project_deadline(uuid,integer,date,text,text),public.add_site_coordinator(uuid,text,text),public.save_project_activity(uuid,uuid,integer,uuid,text,date,text,uuid,uuid[],text),public.monitoring_summary(uuid[]),public.project_timeline(uuid,text,date,date,uuid,uuid,integer) to authenticated;

create function private.protect_monitor_interval() returns trigger language plpgsql set search_path='' as $$
begin
 if tg_op='DELETE' or old.ended_at is not null then raise exception 'Historical intervals are immutable';end if;
 return new;
end; $$;
revoke all on function private.protect_monitor_interval() from public,anon,authenticated;
create trigger protect_project_cycles before update or delete on public.project_operational_cycles for each row execute function private.protect_monitor_interval();
create trigger protect_project_holds before update or delete on public.project_holds for each row execute function private.protect_monitor_interval();
-- Approved matrix: Ops may view assigned design spaces after commercial closure, never edit them.
create or replace function private.can_read_spaces(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and private.can_read_pipeline(p_project) and (private.current_role()<>'operations_admin' or exists(select 1 from public.projects where id=p_project and commercial_status='Closed'))
$$;
