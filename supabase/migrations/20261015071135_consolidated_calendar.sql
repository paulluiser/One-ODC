-- Personal calendar events supplement authoritative dates; never change project permissions.
create table public.calendar_events (
 id uuid primary key, owner_id uuid not null references public.profiles(id),
 title text not null check(length(trim(title)) between 1 and 200),
 event_date date not null, end_date date not null,
 start_time time, end_time time,
 location text not null default '' check(length(location)<=300),
 notes text not null default '' check(length(notes)<=4000),
 version integer not null default 1, cancelled_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 check(event_date between date '2000-01-01' and date '2100-12-31' and end_date<=date '2100-12-31'),
 check(end_date>=event_date and end_date<=event_date+366),
 check((start_time is null and end_time is null) or (start_time is not null and end_time is not null and (end_date>event_date or end_time>start_time)))
);
alter table public.calendar_events enable row level security;
revoke all on public.calendar_events from public,anon,authenticated;
grant select on public.calendar_events to authenticated;
create policy calendar_owner_read on public.calendar_events for select to authenticated using(owner_id=(select auth.uid()) and (select private.current_role()) is not null);
create index calendar_owner_dates on public.calendar_events(owner_id,event_date,end_date) where cancelled_at is null;

create table public.calendar_event_history (
 id uuid primary key default gen_random_uuid(), event_id uuid not null references public.calendar_events(id),
 owner_id uuid not null references public.profiles(id), version integer not null,
 previous_value jsonb, new_value jsonb not null, reason text not null, occurred_at timestamptz not null default now(), unique(event_id,version)
);
alter table public.calendar_event_history enable row level security;
revoke all on public.calendar_event_history from public,anon,authenticated;
grant select on public.calendar_event_history to authenticated;
create policy calendar_history_owner on public.calendar_event_history for select to authenticated using(owner_id=(select auth.uid()) and (select private.current_role()) is not null);
create trigger calendar_history_immutable before update or delete on public.calendar_event_history for each row execute function private.reject_audit_mutation();

create function private.save_calendar_event(p_id uuid,p_version integer,p_data jsonb,p_cancel boolean default false,p_reason text default '') returns integer
language plpgsql security definer set search_path='' as $$
declare previous public.calendar_events; current public.calendar_events; who uuid:=auth.uid();
begin
 if who is null or private.current_role() is null then raise exception 'ACCESS_DENIED'; end if;
 if p_version is null or p_version<0 or p_cancel is null then raise exception 'INVALID_EVENT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('calendar:'||p_id::text,0));
 select * into previous from public.calendar_events where id=p_id for update;
 if found then
  if previous.owner_id<>who then raise exception 'ACCESS_DENIED'; end if;
  if previous.version<>p_version or previous.cancelled_at is not null then raise exception 'STALE_EVENT'; end if;
  if coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  if p_cancel then
   update public.calendar_events set cancelled_at=now(),version=version+1,updated_at=now() where id=p_id returning * into current;
  else
   update public.calendar_events set title=trim(p_data->>'title'),event_date=(p_data->>'date')::date,end_date=(p_data->>'end_date')::date,start_time=nullif(p_data->>'time','')::time,end_time=nullif(p_data->>'end_time','')::time,location=coalesce(p_data->>'location',''),notes=coalesce(p_data->>'notes',''),version=version+1,updated_at=now() where id=p_id returning * into current;
  end if;
 else
  if p_version<>0 or p_cancel then raise exception 'STALE_EVENT'; end if;
  insert into public.calendar_events(id,owner_id,title,event_date,end_date,start_time,end_time,location,notes) values(p_id,who,trim(p_data->>'title'),(p_data->>'date')::date,(p_data->>'end_date')::date,nullif(p_data->>'time','')::time,nullif(p_data->>'end_time','')::time,coalesce(p_data->>'location',''),coalesce(p_data->>'notes','')) returning * into current;
 end if;
 insert into public.calendar_event_history(event_id,owner_id,version,previous_value,new_value,reason) values(p_id,who,current.version,case when previous.id is not null then to_jsonb(previous) else null end,to_jsonb(current),coalesce(p_reason,''));
 -- System audit has operation metadata only; personal titles/dates/notes stay owner-private.
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value) values(who,'calendar_event',p_id,case when p_cancel then 'calendar.event_cancelled' when p_version=0 then 'calendar.event_created' else 'calendar.event_updated' end,case when previous.id is not null then jsonb_build_object('version',previous.version) else null end,jsonb_build_object('version',current.version));
 return current.version;
end $$;
revoke all on function private.save_calendar_event(uuid,integer,jsonb,boolean,text) from public,anon;
grant execute on function private.save_calendar_event(uuid,integer,jsonb,boolean,text) to authenticated;
create function public.save_calendar_event(p_id uuid,p_version integer,p_data jsonb,p_cancel boolean default false,p_reason text default '') returns integer language sql security invoker set search_path='' as $$select private.save_calendar_event(p_id,p_version,p_data,p_cancel,p_reason)$$;
revoke all on function public.save_calendar_event(uuid,integer,jsonb,boolean,text) from public,anon;
grant execute on function public.save_calendar_event(uuid,integer,jsonb,boolean,text) to authenticated;

-- SECURITY INVOKER is essential: each source applies its existing project-specific RLS.
create function public.workspace_calendar(p_from date,p_to date) returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'ACCESS_DENIED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'INVALID_RANGE'; end if;
 with events as (
 select 'project:'||p.id as id,'Project deadline'::text as kind,p.name as title,p.reference as subtitle,m.deadline as date,m.deadline as end_date,null::time as time,null::time as end_time,'/dashboard/projects/'||p.id as href,case when p.is_operationally_completed then 'Completed' else m.state end as status,m.timezone,0 as version,''::text as notes,''::text as location
 from public.projects p join public.project_monitoring m on m.project_id=p.id where not p.is_cancelled and m.deadline between p_from and p_to
 union all
 select 'space:'||s.id,'Space deadline',s.name,p.name,s.deadline,s.deadline,null,null,'/dashboard/projects/'||p.id||'#space-'||s.id,s.status::text,m.timezone,0,'',''
 from public.spaces s join public.projects p on p.id=s.project_id join public.project_monitoring m on m.project_id=p.id where s.cancelled_at is null and not p.is_cancelled and s.deadline between p_from and p_to
 union all
 select 'installation:'||i.space_id,'Installation',s.name,p.name,i.scheduled_date,i.scheduled_date,null,null,'/dashboard/projects/'||p.id||'?tab=installation#installation-'||s.id,i.status::text,m.timezone,0,'',''
 from public.space_installations i join public.spaces s on s.id=i.space_id join public.projects p on p.id=i.project_id join public.project_monitoring m on m.project_id=p.id where s.cancelled_at is null and not p.is_cancelled and i.status<>'Not Applicable' and i.scheduled_date between p_from and p_to
 union all
 select 'handoff:'||p.id,'Expected handoff',p.name,p.reference,p.expected_handoff,p.expected_handoff,null,null,'/dashboard/projects/'||p.id,p.commercial_status::text,'Asia/Manila',0,'',''
 from public.projects p where not p.is_cancelled and p.expected_handoff between p_from and p_to
 union all
 select 'lead:'||l.id,'Lead requested date',l.project_name,l.reference,l.date_needed,l.date_needed,null,null,'/dashboard/leads/'||l.id,l.status::text,'Asia/Manila',0,'',''
 from public.leads l where l.status in ('Draft','Submitted','Returned for Clarification') and l.date_needed between p_from and p_to
 union all
 select e.id::text,'Personal event',e.title,'Only you',e.event_date,e.end_date,e.start_time,e.end_time,null,'Scheduled','Asia/Manila',e.version,e.notes,e.location
 from public.calendar_events e where e.cancelled_at is null and e.event_date<=p_to and e.end_date>=p_from
 ) select coalesce(jsonb_agg(to_jsonb(e) order by e.date,e.time nulls first,e.kind,e.title,e.id),'[]'::jsonb) into result from events e;
 return result;
end $$;
revoke all on function public.workspace_calendar(date,date) from public,anon;
grant execute on function public.workspace_calendar(date,date) to authenticated;
