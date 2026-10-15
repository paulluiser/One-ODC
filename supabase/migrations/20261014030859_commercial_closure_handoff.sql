-- Commercial closure and operational acknowledgment are independent of design and payments.
create table public.commercial_closures (
 id uuid primary key default gen_random_uuid(), project_id uuid not null unique references public.projects(id),
 previous_stage public.commercial_status not null check(previous_stage<>'Closed'),
 sale_amount numeric(28,2) not null check(sale_amount>=0 and sale_amount<1e26), sale_version integer not null,
 closed_by uuid not null references public.profiles(id), closed_at timestamptz not null default now(),
 actor_role public.app_role not null, reason text not null check(length(trim(reason)) between 1 and 2000), administrative_override boolean not null,
 unique(id,project_id)
);
create index commercial_closures_actor on public.commercial_closures(closed_by);
create table public.project_handoffs (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 closure_id uuid not null, number integer not null check(number>0), version integer not null default 1,
 primary_ops_id uuid not null references public.profiles(id), assigned_by uuid not null references public.profiles(id), assigned_at timestamptz not null default now(),
 reason text not null check(length(trim(reason)) between 1 and 2000),
 status text not null default 'Pending Acknowledgment' check(status in ('Pending Acknowledgment','Acknowledged')),
 acknowledged_by uuid references public.profiles(id), acknowledged_at timestamptz, superseded_at timestamptz,
 foreign key(closure_id,project_id) references public.commercial_closures(id,project_id), unique(project_id,number),
 check((status='Pending Acknowledgment' and acknowledged_by is null and acknowledged_at is null) or (status='Acknowledged' and acknowledged_by is not null and acknowledged_at is not null and acknowledged_by=primary_ops_id and acknowledged_at>=assigned_at)),
 check(superseded_at is null or superseded_at>=assigned_at)
);
create unique index handoff_current_per_project on public.project_handoffs(project_id) where superseded_at is null;
create index handoff_primary_ops on public.project_handoffs(primary_ops_id);
create index handoff_assigned_by on public.project_handoffs(assigned_by);
create index handoff_acknowledged_by on public.project_handoffs(acknowledged_by);
create table public.handoff_events (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id), handoff_id uuid not null references public.project_handoffs(id),
 action text not null check(action in ('created','reassigned','acknowledged')), actor_id uuid not null references public.profiles(id),
 occurred_at timestamptz not null default now(), reason text not null, previous_value jsonb, new_value jsonb not null
);
create index handoff_events_project_time on public.handoff_events(project_id,occurred_at,id);
create index handoff_events_handoff on public.handoff_events(handoff_id);
create index handoff_events_actor on public.handoff_events(actor_id);
create trigger closure_immutable before update or delete on public.commercial_closures for each row execute function private.reject_audit_mutation();
create trigger handoff_event_immutable before update or delete on public.handoff_events for each row execute function private.reject_audit_mutation();
alter table public.commercial_closures enable row level security;
alter table public.project_handoffs enable row level security;
alter table public.handoff_events enable row level security;
revoke all on public.commercial_closures,public.project_handoffs,public.handoff_events from public,anon,authenticated;
grant select on public.commercial_closures,public.project_handoffs,public.handoff_events to authenticated;
create function private.handoff_reader(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.can_read_pipeline(p_project) and (private.current_role()<>'operations_admin' or exists(select 1 from public.projects where id=p_project and commercial_status='Closed'))
$$;
revoke all on function private.handoff_reader(uuid) from public,anon;
grant execute on function private.handoff_reader(uuid) to authenticated;
create policy commercial_closure_read on public.commercial_closures for select to authenticated using(private.current_role()<>'operations_admin' and private.can_read_pipeline(project_id));
create policy handoff_read on public.project_handoffs for select to authenticated using(private.handoff_reader(project_id));
create policy handoff_event_read on public.handoff_events for select to authenticated using(private.handoff_reader(project_id));

create function private.protect_handoff_record() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' or old.superseded_at is not null or new.version<>old.version+1 then raise exception 'HISTORY_IMMUTABLE'; end if;
 if (to_jsonb(new)-array['version','superseded_at'])=(to_jsonb(old)-array['version','superseded_at']) and new.superseded_at is not null then return new; end if;
 if old.status='Pending Acknowledgment' and new.status='Acknowledged' and new.acknowledged_by=old.primary_ops_id and new.acknowledged_at is not null and
 (to_jsonb(new)-array['version','status','acknowledged_by','acknowledged_at'])=(to_jsonb(old)-array['version','status','acknowledged_by','acknowledged_at']) then return new; end if;
 raise exception 'HISTORY_IMMUTABLE';
end $$;
revoke all on function private.protect_handoff_record() from public,anon,authenticated;
create trigger handoff_guard before update or delete on public.project_handoffs for each row execute function private.protect_handoff_record();

create function private.create_handoff(p_project uuid,p_closure uuid,p_primary uuid,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare previous public.project_handoffs; created public.project_handoffs;
begin
 -- Caller already holds the Project lock; this internal helper is not client-executable.
 select * into previous from public.project_handoffs where project_id=p_project and superseded_at is null for update;
 if previous.id is not null and previous.primary_ops_id=p_primary then return previous.id; end if;
 if previous.id is not null then update public.project_handoffs set superseded_at=now(),version=version+1 where id=previous.id; end if;
 insert into public.project_handoffs(project_id,closure_id,number,primary_ops_id,assigned_by,reason)
 values(p_project,p_closure,coalesce(previous.number,0)+1,p_primary,auth.uid(),p_reason) returning * into created;
 insert into public.handoff_events(project_id,handoff_id,action,actor_id,reason,previous_value,new_value)
 values(p_project,created.id,case when previous.id is null then 'created' else 'reassigned' end,auth.uid(),p_reason,case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(created));
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'handoff',created.id,'handoff.'||case when previous.id is null then 'created' else 'reassigned' end,case when previous.id is null then null else to_jsonb(previous) end,to_jsonb(created));
 insert into public.notifications(recipient_id,project_id,message) values(p_primary,p_project,'Operational handoff #'||created.number||' is pending your acknowledgment.');
 return created.id;
end $$;
revoke all on function private.create_handoff(uuid,uuid,uuid,text) from public,anon,authenticated;

create function private.close_project_sale(p_project uuid,p_expected_stage public.commercial_status,p_sale_version integer,p_primary_ops uuid,p_confirm boolean,p_reason text) returns uuid language plpgsql security definer set search_path='' as $$
declare r public.app_role; project public.projects; sale public.project_financial_values; primary_ops uuid; closure uuid; reason text:=trim(coalesce(p_reason,''));
begin
 r:=private.require_role(array['bdm','lead_designer','system_administrator']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or not (private.sale_editor(p_project) or (r='lead_designer' and private.space_manager(p_project))) then raise exception 'ACCESS_DENIED'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if project.is_cancelled then raise exception 'PROJECT_CANCELLED'; end if;
 if project.commercial_status='Closed' or exists(select 1 from public.commercial_closures where project_id=p_project) then raise exception 'SALE_ALREADY_CLOSED'; end if;
 if project.commercial_status is distinct from p_expected_stage then raise exception 'STALE_CLOSURE_CONTEXT'; end if;
 if length(reason)>2000 or (r<>'bdm' and reason='') then raise exception 'REASON_REQUIRED'; end if;
 select * into sale from public.project_financial_values where project_id=p_project and kind='Sale';
 if not found then raise exception 'SALE_REQUIRED'; end if;
 if sale.version is distinct from p_sale_version then raise exception 'STALE_CLOSURE_CONTEXT'; end if;
 select m.user_id into primary_ops from public.project_memberships m join public.profiles p on p.id=m.user_id
 where m.project_id=p_project and m.membership_role='operations_admin' and m.is_primary and p.active and p.role='operations_admin' for share of p;
 if primary_ops is null then raise exception 'OPERATIONS_ADMIN_REQUIRED'; end if;
 if primary_ops is distinct from p_primary_ops then raise exception 'STALE_CLOSURE_CONTEXT'; end if;
 if reason='' then reason:='Commercial sale closed'; end if;
 insert into public.commercial_closures(project_id,previous_stage,sale_amount,sale_version,closed_by,actor_role,reason,administrative_override)
 values(p_project,project.commercial_status,sale.amount,sale.version,auth.uid(),r,reason,r<>'bdm') returning id into closure;
 update public.projects set commercial_status='Closed' where id=p_project;
 perform private.create_handoff(p_project,closure,primary_ops,'Commercial closure initiated operational handoff');
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'project',p_project,'commercial.closed',jsonb_build_object('commercial_status',project.commercial_status),jsonb_build_object('closure_id',closure,'sale_amount',sale.amount::text,'sale_version',sale.version,'reason',reason,'administrative_override',r<>'bdm'));
 return closure;
end $$;

create function private.acknowledge_handoff(p_project uuid,p_handoff uuid,p_version integer,p_confirm boolean) returns void language plpgsql security definer set search_path='' as $$
declare previous public.project_handoffs; current public.project_handoffs;
begin
 perform private.require_role(array['operations_admin']::public.app_role[]);
 perform 1 from public.projects where id=p_project and commercial_status='Closed' and not is_cancelled for update;
 if not found or not private.can_read_pipeline(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 select * into previous from public.project_handoffs where id=p_handoff and project_id=p_project and superseded_at is null for update;
 if not found or previous.primary_ops_id<>auth.uid() or not exists(select 1 from public.project_memberships where project_id=p_project and membership_role='operations_admin' and is_primary and user_id=auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if previous.status='Acknowledged' then raise exception 'HANDOFF_ALREADY_ACKNOWLEDGED'; end if;
 if previous.version is distinct from p_version then raise exception 'STALE_CLOSURE_CONTEXT'; end if;
 update public.project_handoffs set status='Acknowledged',acknowledged_by=auth.uid(),acknowledged_at=now(),version=version+1 where id=previous.id returning * into current;
 insert into public.handoff_events(project_id,handoff_id,action,actor_id,reason,previous_value,new_value) values(p_project,current.id,'acknowledged',auth.uid(),'Receipt acknowledged',to_jsonb(previous),to_jsonb(current));
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'handoff',current.id,'handoff.acknowledged',to_jsonb(previous),to_jsonb(current));
end $$;

-- Extend the established assignment transaction; changing the primary requires fresh acknowledgment.
create or replace function private.assign_project_personnel(p_project uuid,p_primary uuid,p_support uuid[],p_ops uuid[],p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.app_role; owner uuid; stage public.commercial_status; closure uuid;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select lead_designer_id,commercial_status into owner,stage from public.projects where id=p_project for update;
 if not found or (r<>'system_administrator' and owner<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if stage='Closed' and coalesce(cardinality(p_ops),0)=0 then raise exception 'OPERATIONS_ADMIN_REQUIRED'; end if;
 perform private.set_project_assignments(p_project,p_primary,p_support,p_ops,p_reason);
 select id into closure from public.commercial_closures where project_id=p_project;
 if closure is not null then perform private.create_handoff(p_project,closure,p_ops[1],trim(p_reason)); end if;
end $$;

create function private.get_commercial_handoff(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects; sale public.project_financial_values; closure public.commercial_closures; current public.project_handoffs; primary_ops uuid; result jsonb; timezone text;
begin
 if not private.handoff_reader(p_project) then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into closure from public.commercial_closures where project_id=p_project;
 select * into current from public.project_handoffs where project_id=p_project and superseded_at is null;
 select m.user_id into primary_ops from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project and m.membership_role='operations_admin' and m.is_primary and p.active and p.role='operations_admin';
 select coalesce(m.timezone,'Asia/Manila') into timezone from public.project_monitoring m where m.project_id=p_project;
 timezone:=coalesce(timezone,'Asia/Manila');
 result:=jsonb_build_object('project_id',p_project,'commercial_status',project.commercial_status,'cancelled',project.is_cancelled,'closed_at',closure.closed_at,
 'status',coalesce(current.status,case when project.commercial_status='Closed' then 'Legacy Closed — no recorded handoff' else 'Not Required' end),
 'current',case when current.id is null then null else to_jsonb(current) end,
 'age_days',case when closure.id is null then null else ((coalesce(current.acknowledged_at,now()) at time zone timezone)::date-(closure.closed_at at time zone timezone)::date) end,
 'can_acknowledge',not project.is_cancelled and current.status='Pending Acknowledgment' and private.current_role()='operations_admin' and primary_ops=auth.uid() and current.primary_ops_id=auth.uid(),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.number) from public.project_handoffs h where h.project_id=p_project),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id) from public.handoff_events e where e.project_id=p_project),'[]'::jsonb));
 if private.current_role()<>'operations_admin' then
  select * into sale from public.project_financial_values where project_id=p_project and kind='Sale';
  result:=result||jsonb_build_object('sale',jsonb_build_object('amount',sale.amount::text,'version',coalesce(sale.version,0)),
   'closure',case when closure.id is null then null else to_jsonb(closure)||jsonb_build_object('sale_amount',closure.sale_amount::text) end,
   'primary_ops_id',primary_ops,'can_close',not project.is_cancelled and project.commercial_status<>'Closed' and (private.sale_editor(p_project) or (private.current_role()='lead_designer' and private.space_manager(p_project))),
   'administrative',private.current_role() in ('lead_designer','system_administrator'));
 end if;
 return result;
end $$;

create function public.close_project_sale(p_project uuid,p_expected_stage public.commercial_status,p_sale_version integer,p_primary_ops uuid,p_confirm boolean,p_reason text) returns uuid language sql security invoker set search_path='' as $$select private.close_project_sale(p_project,p_expected_stage,p_sale_version,p_primary_ops,p_confirm,p_reason)$$;
create function public.acknowledge_handoff(p_project uuid,p_handoff uuid,p_version integer,p_confirm boolean) returns void language sql security invoker set search_path='' as $$select private.acknowledge_handoff(p_project,p_handoff,p_version,p_confirm)$$;
create function public.get_commercial_handoff(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$select private.get_commercial_handoff(p_project)$$;
revoke all on function private.close_project_sale(uuid,public.commercial_status,integer,uuid,boolean,text),public.close_project_sale(uuid,public.commercial_status,integer,uuid,boolean,text),private.acknowledge_handoff(uuid,uuid,integer,boolean),public.acknowledge_handoff(uuid,uuid,integer,boolean),private.get_commercial_handoff(uuid),public.get_commercial_handoff(uuid) from public,anon;
grant execute on function private.close_project_sale(uuid,public.commercial_status,integer,uuid,boolean,text),public.close_project_sale(uuid,public.commercial_status,integer,uuid,boolean,text),private.acknowledge_handoff(uuid,uuid,integer,boolean),public.acknowledge_handoff(uuid,uuid,integer,boolean),private.get_commercial_handoff(uuid),public.get_commercial_handoff(uuid) to authenticated;
