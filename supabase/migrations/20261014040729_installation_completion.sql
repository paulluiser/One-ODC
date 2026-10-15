create table public.space_installations (
 space_id uuid primary key references public.spaces(id), project_id uuid not null references public.projects(id),
 status text not null check(status in ('Not Scheduled','Scheduled','In Progress','On Hold','Completed','Not Applicable')),
 scheduled_date date, completed_at timestamptz, version integer not null default 1,
 updated_by uuid not null references public.profiles(id),updated_at timestamptz not null default now(),
 check((status='Completed' and completed_at is not null) or (status<>'Completed' and completed_at is null)),
 check(status<>'Scheduled' or scheduled_date is not null),unique(space_id,project_id)
);
create index installation_project on public.space_installations(project_id);
create index installation_actor on public.space_installations(updated_by);
create table public.installation_events (
 id uuid primary key default gen_random_uuid(),space_id uuid not null,project_id uuid not null,version integer not null,
 actor_id uuid not null references public.profiles(id),occurred_at timestamptz not null default now(),reason text not null,
 previous_value jsonb,new_value jsonb not null,administrative_override boolean not null,
 foreign key(space_id,project_id) references public.space_installations(space_id,project_id),unique(space_id,version)
);
create index installation_event_project on public.installation_events(project_id,occurred_at);
create index installation_event_actor on public.installation_events(actor_id);
create table public.operational_completions (
 project_id uuid not null,cycle_number integer not null,completed_at timestamptz not null default now(),
 completed_by uuid not null references public.profiles(id),reason text not null,administrative_override boolean not null,
 snapshot jsonb not null,primary key(project_id,cycle_number),foreign key(project_id,cycle_number) references public.project_operational_cycles(project_id,number)
);
create index completion_actor on public.operational_completions(completed_by);
create trigger installation_events_immutable before update or delete on public.installation_events for each row execute function private.reject_audit_mutation();
create trigger completion_immutable before update or delete on public.operational_completions for each row execute function private.reject_audit_mutation();
alter table public.space_installations enable row level security;
alter table public.installation_events enable row level security;
alter table public.operational_completions enable row level security;
revoke all on public.space_installations,public.installation_events,public.operational_completions from public,anon,authenticated;
grant select on public.space_installations,public.installation_events,public.operational_completions to authenticated;
create policy installation_read on public.space_installations for select to authenticated using(private.logistics_reader(project_id));
create policy installation_event_read on public.installation_events for select to authenticated using(private.logistics_reader(project_id));
create policy completion_read on public.operational_completions for select to authenticated using(private.logistics_reader(project_id));

create function private.freeze_completed_operations() returns trigger language plpgsql security definer set search_path='' as $$
declare target uuid;
begin
 target:=new.project_id;
 perform 1 from public.projects where id=target for update;
 if not exists(select 1 from public.project_operational_cycles where project_id=target and ended_at is null) and exists(select 1 from public.project_operational_cycles where project_id=target and outcome='Completed') then raise exception 'PROJECT_COMPLETED_REOPEN_REQUIRED'; end if;
 return new;
end $$;
revoke all on function private.freeze_completed_operations() from public,anon,authenticated;
create trigger completion_freeze_spaces before insert or update on public.spaces for each row execute function private.freeze_completed_operations();
create trigger completion_freeze_logistics before insert or update on public.project_logistics for each row execute function private.freeze_completed_operations();
create trigger completion_freeze_installations before insert or update on public.space_installations for each row execute function private.freeze_completed_operations();

create function private.save_installation(p_space uuid,p_project uuid,p_version integer,p_status text,p_date date,p_reason text,p_override boolean) returns void language plpgsql security definer set search_path='' as $$
declare project public.projects; space public.spaces; previous public.space_installations; current public.space_installations; manager boolean; acknowledged boolean; held boolean; reason text:=trim(coalesce(p_reason,'')); ordinary boolean;
begin
 perform private.require_role(array['designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or not private.logistics_reader(p_project) then raise exception 'ACCESS_DENIED'; end if;
 select * into space from public.spaces where id=p_space and project_id=p_project for update;
 manager:=private.space_manager(p_project);
 if not found or not (private.space_editor(p_space) or private.current_role()='operations_admin') then raise exception 'ACCESS_DENIED'; end if;
 if project.is_cancelled or space.cancelled_at is not null then raise exception 'PROJECT_CANCELLED'; end if;
 if not exists(select 1 from public.project_operational_cycles where project_id=p_project and ended_at is null) then raise exception 'PROJECT_COMPLETED_REOPEN_REQUIRED'; end if;
 select exists(select 1 from public.project_handoffs where project_id=p_project and superseded_at is null and status='Acknowledged') into acknowledged;
 if not acknowledged and not (manager and coalesce(p_override,false) and reason<>'') then raise exception 'HANDOFF_REQUIRED'; end if;
 if coalesce(p_override,false) and not manager then raise exception 'ACCESS_DENIED'; end if;
 if p_version is null or p_version<0 or coalesce(p_status,'') not in ('Not Scheduled','Scheduled','In Progress','On Hold','Completed','Not Applicable') or length(reason)>2000 then raise exception 'INVALID_INSTALLATION'; end if;
 if p_status='Scheduled' and p_date is null then raise exception 'INSTALLATION_DATE_REQUIRED'; end if;
 select * into previous from public.space_installations where space_id=p_space for update;
 if coalesce(previous.version,0)<>p_version then raise exception 'VERSION_CONFLICT'; end if;
 select state='On Hold' into held from public.project_monitoring where project_id=p_project;
 if held and (previous.space_id is null or previous.status<>p_status or previous.scheduled_date is distinct from p_date) then raise exception 'PROJECT_HELD'; end if;
 ordinary:=((coalesce(previous.status,'Not Scheduled')='Not Scheduled' and p_status='Scheduled') or (previous.status='Scheduled' and p_status='In Progress') or (previous.status='In Progress' and p_status='Completed')) and previous.scheduled_date is not distinct from p_date;
 if (not coalesce(ordinary,false) or p_status in ('Not Applicable','On Hold') or previous.status in ('Completed','Not Applicable','On Hold') or private.current_role()='system_administrator' or coalesce(p_override,false) or not acknowledged) and reason='' then raise exception 'REASON_REQUIRED'; end if;
 if reason='' then reason:='Normal installation progression'; end if;
 if previous.space_id is null then
  insert into public.space_installations(space_id,project_id,status,scheduled_date,completed_at,updated_by) values(p_space,p_project,p_status,p_date,case when p_status='Completed' then now() else null end,auth.uid()) returning * into current;
 else
  update public.space_installations set status=p_status,scheduled_date=p_date,completed_at=case when p_status='Completed' then coalesce(previous.completed_at,now()) else null end,version=version+1,updated_by=auth.uid(),updated_at=now() where space_id=p_space returning * into current;
 end if;
 insert into public.installation_events(space_id,project_id,version,actor_id,reason,previous_value,new_value,administrative_override) values(p_space,p_project,current.version,auth.uid(),reason,case when previous.space_id is null then null else to_jsonb(previous) end,to_jsonb(current),coalesce(p_override,false) or private.current_role()='system_administrator');
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'installation',p_space,'installation.changed',case when previous.space_id is null then null else to_jsonb(previous) end,to_jsonb(current)||jsonb_build_object('reason',reason,'administrative_override',coalesce(p_override,false) or private.current_role()='system_administrator'));
end $$;

create function private.operational_readiness(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects; monitoring public.project_monitoring; blockers jsonb:='[]'; cycle integer;
begin
 if not private.can_read_pipeline(p_project) or (private.current_role()='operations_admin' and not private.logistics_reader(p_project)) then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project;
 select * into monitoring from public.project_monitoring where project_id=p_project;
 select number into cycle from public.project_operational_cycles where project_id=p_project and ended_at is null;
 if project.commercial_status<>'Closed' then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','commercial','label','Commercial Sale must be closed')); end if;
 if not exists(select 1 from public.project_handoffs where project_id=p_project and superseded_at is null and status='Acknowledged') then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','handoff','label','Current operational handoff must be acknowledged')); end if;
 if monitoring.state<>'Active' or project.is_cancelled then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','lifecycle','label','Project must be Active, not On Hold or Cancelled')); end if;
 if cycle is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','cycle','label','No open operational cycle; completed Projects must be reopened first')); end if;
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','design','id',s.id,'label',s.name||': design '||s.status)) from public.spaces s where s.project_id=p_project and s.cancelled_at is null and s.status<>'Completed'),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','installation','id',s.id,'label',s.name||': installation '||coalesce(i.status,'Not Scheduled'))) from public.spaces s left join public.space_installations i on i.space_id=s.id where s.project_id=p_project and s.cancelled_at is null and coalesce(i.status,'Not Scheduled') not in ('Completed','Not Applicable')),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','logistics','id',l.id,'label',l.supplier_name||': logistics '||l.status)) from public.project_logistics l where l.project_id=p_project and l.status not in ('Delivered','Cancelled')),'[]');
 return jsonb_build_object('project_id',p_project,'version',monitoring.version,'cycle',cycle,'ready',jsonb_array_length(blockers)=0,'blockers',blockers,'can_complete',private.space_manager(p_project),'completed',cycle is null and exists(select 1 from public.project_operational_cycles where project_id=p_project and outcome='Completed'),'history',coalesce((select jsonb_agg(jsonb_build_object('cycle',c.cycle_number,'completed_at',c.completed_at,'completed_by',c.completed_by,'reason',c.reason,'administrative_override',c.administrative_override) order by c.cycle_number) from public.operational_completions c where c.project_id=p_project),'[]'));
end $$;
create function private.complete_operations(p_project uuid,p_version integer,p_cycle integer,p_confirm boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
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
 snapshot:=jsonb_build_object('spaces',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('installation',to_jsonb(i))) from public.spaces s left join public.space_installations i on i.space_id=s.id where s.project_id=p_project and s.cancelled_at is null),'[]'),'logistics',coalesce((select jsonb_agg(to_jsonb(l)) from public.project_logistics l where l.project_id=p_project),'[]'),'handoff',(select to_jsonb(h) from public.project_handoffs h where h.project_id=p_project and superseded_at is null));
 insert into public.operational_completions(project_id,cycle_number,completed_by,reason,administrative_override,snapshot) values(p_project,p_cycle,auth.uid(),reason,private.current_role()='system_administrator',snapshot);
 update public.project_operational_cycles set ended_at=now(),outcome='Completed' where project_id=p_project and number=p_cycle and ended_at is null;
 update public.project_monitoring set version=version+1 where project_id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'project',p_project,'project.operationally_completed',jsonb_build_object('cycle',p_cycle,'reason',reason,'administrative_override',private.current_role()='system_administrator'));
 insert into public.notifications(recipient_id,project_id,message) select distinct user_id,p_project,'Project operational cycle '||p_cycle||' completed.' from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project and p.active;
end $$;
create function public.save_installation(p_space uuid,p_project uuid,p_version integer,p_status text,p_date date,p_reason text,p_override boolean default false) returns void language sql security invoker set search_path='' as $$select private.save_installation(p_space,p_project,p_version,p_status,p_date,p_reason,p_override)$$;
create function public.operational_readiness(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$select private.operational_readiness(p_project)$$;
create function public.complete_operations(p_project uuid,p_version integer,p_cycle integer,p_confirm boolean,p_reason text) returns void language sql security invoker set search_path='' as $$select private.complete_operations(p_project,p_version,p_cycle,p_confirm,p_reason)$$;
revoke all on function private.save_installation(uuid,uuid,integer,text,date,text,boolean),public.save_installation(uuid,uuid,integer,text,date,text,boolean),private.operational_readiness(uuid),public.operational_readiness(uuid),private.complete_operations(uuid,integer,integer,boolean,text),public.complete_operations(uuid,integer,integer,boolean,text) from public,anon;
grant execute on function private.save_installation(uuid,uuid,integer,text,date,text,boolean),public.save_installation(uuid,uuid,integer,text,date,text,boolean),private.operational_readiness(uuid),public.operational_readiness(uuid),private.complete_operations(uuid,integer,integer,boolean,text),public.complete_operations(uuid,integer,integer,boolean,text) to authenticated;

alter table public.projects add column is_operationally_completed boolean not null default false;
update public.projects p set is_operationally_completed=true where not exists(select 1 from public.project_operational_cycles c where c.project_id=p.id and c.ended_at is null) and exists(select 1 from public.project_operational_cycles c where c.project_id=p.id and c.outcome='Completed');
create function private.sync_completed_project() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.projects p set is_operationally_completed=not exists(select 1 from public.project_operational_cycles c where c.project_id=new.project_id and c.ended_at is null) and exists(select 1 from public.project_operational_cycles c where c.project_id=new.project_id and c.outcome='Completed') where p.id=new.project_id;
 return new;
end $$;
revoke all on function private.sync_completed_project() from public,anon,authenticated;
create trigger operational_cycle_completion_flag after insert or update on public.project_operational_cycles for each row execute function private.sync_completed_project();
create function private.protect_installation_record() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if (new.space_id,new.project_id) is distinct from (old.space_id,old.project_id) or new.version<>old.version+1 then raise exception 'HISTORY_IMMUTABLE'; end if;
 return new;
end $$;
revoke all on function private.protect_installation_record() from public,anon,authenticated;
create trigger installation_identity_guard before update or delete on public.space_installations for each row execute function private.protect_installation_record();
create trigger completion_freeze_operational_activities before insert or update on public.project_activities for each row when (new.category in ('Design Work','Revision','Site Visit','Supplier Update','Installation')) execute function private.freeze_completed_operations();
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
 union all select e.id,e.space_id,e.actor_id,'Installation','Installation: '||coalesce(e.previous_value->>'status','Not Scheduled')||' → '||(e.new_value->>'status')||' · '||e.reason,(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.installation_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and private.logistics_reader(p_project)
 union all select e.id,null,e.actor_id,'System Event','Operational completion: '||coalesce(e.new_value->>'reason',''),(e.occurred_at at time zone m.timezone)::date,e.occurred_at,e.occurred_at,'system' from public.audit_events e join public.project_monitoring m on m.project_id=e.project_id where e.project_id=p_project and e.action='project.operationally_completed' and private.logistics_reader(p_project)
 ) t where (coalesce(p_category,'')='' or t.category=p_category) and (p_from is null or t.date>=p_from) and (p_to is null or t.date<=p_to) and (p_actor is null or t.actor_id=p_actor) and (p_space is null or t.space_id=p_space) order by occurred_at desc,recorded_at desc,id limit 50 offset p_offset
 ) x;return result;
end; $$;

