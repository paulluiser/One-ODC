-- Space lifecycle is independent of commercial and installation status.
create type public.space_design_status as enum ('Not Started','In Progress','Submitted','For Revision','Completed','On Hold');
create table public.spaces (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 name text not null check(length(trim(name)) between 1 and 200),
 primary_designer_id uuid not null references public.profiles(id), primary_assigned_at timestamptz not null default now(),
 deadline date, status public.space_design_status not null default 'Not Started', version integer not null default 1,
 revision_number integer not null default 0, first_completed_at timestamptz, last_completed_at timestamptz,
 held_status public.space_design_status, cancelled_at timestamptz, cancellation_reason text,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.space_supporters (
 space_id uuid not null references public.spaces(id), user_id uuid not null references public.profiles(id),
 assigned_at timestamptz not null default now(), primary key(space_id,user_id)
);
create table public.space_events (
 id uuid primary key default gen_random_uuid(), space_id uuid not null references public.spaces(id),
 project_id uuid not null references public.projects(id), actor_id uuid not null references public.profiles(id),
 action text not null, reason text not null, previous_value jsonb, new_value jsonb not null, occurred_at timestamptz not null default now()
);
create index spaces_project_idx on public.spaces(project_id,created_at,id);
create index spaces_primary_idx on public.spaces(primary_designer_id);
create index spaces_creator_idx on public.spaces(created_by);
create index space_supporter_user_idx on public.space_supporters(user_id);
create index space_events_history_idx on public.space_events(project_id,occurred_at desc);
create index space_events_space_idx on public.space_events(space_id);
create index space_events_actor_idx on public.space_events(actor_id);
create trigger space_events_immutable before update or delete on public.space_events for each row execute function private.reject_audit_mutation();

create function private.can_read_spaces(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and private.current_role()<>'operations_admin' and private.can_read_pipeline(p_project)
$$;
revoke all on function private.can_read_spaces(uuid) from public,anon;
grant execute on function private.can_read_spaces(uuid) to authenticated;
alter table public.spaces enable row level security;
alter table public.space_supporters enable row level security;
alter table public.space_events enable row level security;
revoke all on public.spaces,public.space_supporters,public.space_events from anon,authenticated;
grant select on public.spaces,public.space_supporters,public.space_events to authenticated;
create policy space_read on public.spaces for select to authenticated using(private.can_read_spaces(project_id));
create policy space_support_read on public.space_supporters for select to authenticated using(exists(select 1 from public.spaces s where s.id=space_id));
create policy space_event_read on public.space_events for select to authenticated using(private.can_read_spaces(project_id));

create function private.space_snapshot(p_id uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select to_jsonb(s)||jsonb_build_object('supporters',coalesce((select jsonb_agg(to_jsonb(a) order by a.user_id) from public.space_supporters a where a.space_id=s.id),'[]'::jsonb)) from public.spaces s where s.id=p_id
$$;
create function private.space_manager(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role()='system_administrator' or (private.current_role()='lead_designer' and exists(select 1 from public.projects where id=p_project and lead_designer_id=auth.uid()))
$$;
create function private.space_editor(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.space_manager(s.project_id) or (private.current_role() in ('designer','lead_designer') and private.can_read_spaces(s.project_id) and (s.primary_designer_id=auth.uid() or exists(select 1 from public.space_supporters a where a.space_id=s.id and a.user_id=auth.uid()))) from public.spaces s where s.id=p_id
$$;
create function private.validate_space_assignees(p_project uuid,p_primary uuid,p_support uuid[]) returns void language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 if p_primary is null or p_support is null or p_primary=any(p_support) or cardinality(p_support)>50 or exists(select 1 from unnest(p_support) a where a is null) or cardinality(p_support)<>(select count(distinct a) from unnest(p_support) a) then raise exception 'INVALID_ASSIGNMENTS'; end if;
 for target in select distinct a from unnest(array[p_primary]||p_support) a order by a loop
  perform 1 from public.profiles p where p.id=target and p.active and p.role in ('designer','lead_designer') for share;
  if not found then raise exception 'INVALID_ASSIGNMENTS'; end if;
  if not exists(select 1 from public.project_memberships m where m.project_id=p_project and m.user_id=target and m.membership_role in ('designer','lead_designer')) then raise exception 'INVALID_ASSIGNMENTS'; end if;
 end loop;
end; $$;
create function private.record_space_event(p_id uuid,p_action text,p_reason text,p_previous jsonb,p_extra jsonb default '{}') returns void language plpgsql security definer set search_path='' as $$
declare snapshot jsonb; project uuid;
begin
 snapshot:=private.space_snapshot(p_id)||p_extra; project:=(snapshot->>'project_id')::uuid;
 insert into public.space_events(space_id,project_id,actor_id,action,reason,previous_value,new_value) values(p_id,project,auth.uid(),p_action,trim(p_reason),p_previous,snapshot);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),project,'space',p_id,p_action,p_previous,snapshot||jsonb_build_object('reason',trim(p_reason)));
 insert into public.notifications(recipient_id,project_id,message)
 select distinct recipient,project,'A space in your project was updated: '||p_action||'.' from (
 select (snapshot->>'primary_designer_id')::uuid recipient union select (p_previous->>'primary_designer_id')::uuid
 union select (a->>'user_id')::uuid from jsonb_array_elements(snapshot->'supporters') a
 union select (a->>'user_id')::uuid from jsonb_array_elements(p_previous->'supporters') a
 ) recipients where recipient is not null and recipient<>auth.uid();
end; $$;

create function private.save_space(p_id uuid,p_project uuid,p_expected_version integer,p_name text,p_deadline date,p_primary uuid,p_support uuid[],p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare s public.spaces; previous jsonb; old_support uuid[]; manager boolean;
begin
 perform private.require_role(array['lead_designer','system_administrator','designer']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.can_read_spaces(p_project) then raise exception 'ACCESS_DENIED'; end if;
 manager:=private.space_manager(p_project);
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 or length(trim(coalesce(p_name,''))) not between 1 and 200 then raise exception 'VALIDATION_ERROR'; end if;
 select * into s from public.spaces where id=p_id for update;
 if found then
  if s.project_id<>p_project or not coalesce(private.space_editor(p_id),false) then raise exception 'ACCESS_DENIED'; end if;
  if s.cancelled_at is not null then raise exception 'SPACE_CANCELLED'; end if;
  if p_expected_version is distinct from s.version then raise exception 'VERSION_CONFLICT'; end if;
  previous:=private.space_snapshot(p_id);
  select coalesce(array_agg(user_id order by user_id),'{}'::uuid[]) into old_support from public.space_supporters where space_id=p_id;
  if not manager and (p_primary is distinct from s.primary_designer_id or old_support is distinct from array(select a from unnest(p_support) a order by a)) then raise exception 'ACCESS_DENIED'; end if;
  perform private.validate_space_assignees(p_project,p_primary,p_support);
  update public.spaces set name=trim(p_name),deadline=p_deadline,primary_designer_id=p_primary,primary_assigned_at=case when p_primary=s.primary_designer_id then primary_assigned_at else now() end,version=version+1,updated_at=now() where id=p_id;
 else
  if not manager then raise exception 'ACCESS_DENIED'; end if;
  if p_expected_version is distinct from 0 or p_id is null then raise exception 'VERSION_CONFLICT'; end if;
  perform private.validate_space_assignees(p_project,p_primary,p_support);
  insert into public.spaces(id,project_id,name,primary_designer_id,deadline,created_by) values(p_id,p_project,trim(p_name),p_primary,p_deadline,auth.uid());
 end if;
 delete from public.space_supporters where space_id=p_id and not(user_id=any(p_support));
 insert into public.space_supporters(space_id,user_id) select p_id,a from unnest(p_support) a on conflict do nothing;
 perform private.record_space_event(p_id,case when previous is null then 'space.created' else 'space.edited' end,p_reason,previous);
 return p_id;
end; $$;

create function private.change_space_status(p_id uuid,p_expected_version integer,p_status public.space_design_status,p_reason text,p_approval text default '') returns void language plpgsql security definer set search_path='' as $$
declare s public.spaces; project uuid; r public.app_role; manager boolean; allowed boolean; previous jsonb;
begin
 r:=private.require_role(array['lead_designer','system_administrator','designer']::public.app_role[]);
 select project_id into project from public.spaces where id=p_id;
 perform 1 from public.projects where id=project for update;
 select * into s from public.spaces where id=p_id for update;
 if not found or not coalesce(private.space_editor(p_id),false) then raise exception 'ACCESS_DENIED'; end if;
 if s.cancelled_at is not null then raise exception 'SPACE_CANCELLED'; end if;
 if p_expected_version is distinct from s.version then raise exception 'VERSION_CONFLICT'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 or p_status is null or p_status=s.status then raise exception 'VALIDATION_ERROR'; end if;
 manager:=private.space_manager(project);
 allowed:=case s.status
 when 'Not Started' then p_status in ('In Progress','On Hold')
 when 'In Progress' then p_status in ('Submitted','On Hold')
 when 'For Revision' then p_status in ('In Progress','Submitted','On Hold')
 when 'Submitted' then manager and p_status in ('For Revision','Completed','On Hold')
 when 'Completed' then manager and p_status='For Revision'
 when 'On Hold' then p_status=s.held_status else false end;
 if p_status='Completed' and r<>'system_administrator' and (not manager or r<>'lead_designer' or length(trim(coalesce(p_approval,''))) not between 1 and 2000) then raise exception 'ACCESS_DENIED'; end if;
 if not coalesce(allowed,false) and r<>'system_administrator' then raise exception 'INVALID_TRANSITION'; end if;
 previous:=private.space_snapshot(p_id);
 update public.spaces set status=p_status,version=version+1,updated_at=now(),
 held_status=case when p_status='On Hold' then status else null end,
 revision_number=revision_number+case when status='Completed' and p_status<>'Completed' then 1 else 0 end,
 first_completed_at=case when p_status='Completed' then coalesce(first_completed_at,now()) else first_completed_at end,
 last_completed_at=case when p_status='Completed' then now() else last_completed_at end where id=p_id;
 perform private.record_space_event(p_id,'space.status_changed',p_reason,previous,jsonb_build_object('external_approval',trim(coalesce(p_approval,'')),'administrator_override',r='system_administrator'));
end; $$;

create function private.cancel_space(p_id uuid,p_expected_version integer,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare s public.spaces; project uuid; previous jsonb;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select project_id into project from public.spaces where id=p_id;
 perform 1 from public.projects where id=project for update;
 select * into s from public.spaces where id=p_id for update;
 if not found or not private.space_manager(project) then raise exception 'ACCESS_DENIED'; end if;
 if s.cancelled_at is not null then raise exception 'SPACE_CANCELLED'; end if;
 if p_expected_version is distinct from s.version then raise exception 'VERSION_CONFLICT'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'VALIDATION_ERROR'; end if;
 previous:=private.space_snapshot(p_id);
 update public.spaces set cancelled_at=now(),cancellation_reason=trim(p_reason),version=version+1,updated_at=now() where id=p_id;
 perform private.record_space_event(p_id,'space.cancelled',p_reason,previous);
end; $$;

create function private.bulk_reassign_spaces(p_project uuid,p_spaces jsonb,p_primary uuid,p_support uuid[],p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare item jsonb; s public.spaces;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.space_manager(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if p_spaces is null or jsonb_typeof(p_spaces)<>'array' or jsonb_array_length(p_spaces) not between 1 and 100 or jsonb_array_length(p_spaces)<>(select count(distinct (a->>'id')::uuid) from jsonb_array_elements(p_spaces) a) then raise exception 'VALIDATION_ERROR'; end if;
 perform private.validate_space_assignees(p_project,p_primary,p_support);
 for item in select a from jsonb_array_elements(p_spaces) a order by (a->>'id')::uuid loop
  select * into s from public.spaces where id=(item->>'id')::uuid for update;
  if not found or s.project_id<>p_project then raise exception 'ACCESS_DENIED'; end if;
  if s.cancelled_at is not null then raise exception 'SPACE_CANCELLED'; end if;
  if (item->>'version')::integer is distinct from s.version then raise exception 'VERSION_CONFLICT'; end if;
 end loop;
 for item in select a from jsonb_array_elements(p_spaces) a order by (a->>'id')::uuid loop
  select * into s from public.spaces where id=(item->>'id')::uuid;
  perform private.save_space(s.id,p_project,s.version,s.name,s.deadline,p_primary,p_support,p_reason);
 end loop;
end; $$;

-- Public endpoints are invokers; only actor-checked private entrypoints are executable.
create function public.save_space(p_id uuid,p_project uuid,p_expected_version integer,p_name text,p_deadline date,p_primary uuid,p_support uuid[],p_reason text) returns uuid language sql security invoker set search_path='' as $$ select private.save_space(p_id,p_project,p_expected_version,p_name,p_deadline,p_primary,p_support,p_reason) $$;
create function public.change_space_status(p_id uuid,p_expected_version integer,p_status public.space_design_status,p_reason text,p_approval text default '') returns void language sql security invoker set search_path='' as $$ select private.change_space_status(p_id,p_expected_version,p_status,p_reason,p_approval) $$;
create function public.cancel_space(p_id uuid,p_expected_version integer,p_reason text) returns void language sql security invoker set search_path='' as $$ select private.cancel_space(p_id,p_expected_version,p_reason) $$;
create function public.bulk_reassign_spaces(p_project uuid,p_spaces jsonb,p_primary uuid,p_support uuid[],p_reason text) returns void language sql security invoker set search_path='' as $$ select private.bulk_reassign_spaces(p_project,p_spaces,p_primary,p_support,p_reason) $$;
revoke all on function private.space_snapshot(uuid),private.space_manager(uuid),private.space_editor(uuid),private.validate_space_assignees(uuid,uuid,uuid[]),private.record_space_event(uuid,text,text,jsonb,jsonb) from public,anon,authenticated;
revoke all on function private.save_space(uuid,uuid,integer,text,date,uuid,uuid[],text),private.change_space_status(uuid,integer,public.space_design_status,text,text),private.cancel_space(uuid,integer,text),private.bulk_reassign_spaces(uuid,jsonb,uuid,uuid[],text),public.save_space(uuid,uuid,integer,text,date,uuid,uuid[],text),public.change_space_status(uuid,integer,public.space_design_status,text,text),public.cancel_space(uuid,integer,text),public.bulk_reassign_spaces(uuid,jsonb,uuid,uuid[],text) from public,anon,authenticated;
grant execute on function private.save_space(uuid,uuid,integer,text,date,uuid,uuid[],text),private.change_space_status(uuid,integer,public.space_design_status,text,text),private.cancel_space(uuid,integer,text),private.bulk_reassign_spaces(uuid,jsonb,uuid,uuid[],text),public.save_space(uuid,uuid,integer,text,date,uuid,uuid[],text),public.change_space_status(uuid,integer,public.space_design_status,text,text),public.cancel_space(uuid,integer,text),public.bulk_reassign_spaces(uuid,jsonb,uuid,uuid[],text) to authenticated;
