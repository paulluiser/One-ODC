begin;
create type public.lead_status as enum ('Draft', 'Submitted', 'Returned for Clarification', 'Accepted', 'Rejected');
create sequence public.lead_reference_seq;
create sequence public.project_reference_seq;
create table public.leads (
  id uuid primary key,
  reference text not null unique default ('ODC-L-' || to_char(now() at time zone 'Asia/Manila','YYYY') || '-' || lpad(nextval('public.lead_reference_seq')::text,6,'0')),
  bdm_id uuid not null references public.profiles(id),
  project_name text not null default '' check(length(project_name)<=200),
  address text not null default '' check(length(address)<=2000),
  brand text check(brand in ('SFY','Stosa','Both')),
  cabinetry_count integer check(cabinetry_count>0),
  notes text not null default '' check(length(notes)<=10000),
  date_needed date,
  attachment_metadata jsonb not null default '[]' check(jsonb_typeof(attachment_metadata)='array' and jsonb_array_length(attachment_metadata)<=5),
  status public.lead_status not null default 'Draft',
  version integer not null default 0,
  submission_count integer not null default 0,
  first_submitted_at timestamptz,
  last_submitted_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(status='Draft' or (length(trim(project_name))>0 and length(trim(address))>0 and cabinetry_count is not null))
);
create table public.lead_submissions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id),
  number integer not null,
  snapshot jsonb not null,
  submitted_by uuid not null references public.profiles(id),
  submitted_at timestamptz not null default now(),
  unique(lead_id,number)
);
create table public.lead_reviews (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id),
  submission_id uuid not null unique references public.lead_submissions(id),
  reviewer_id uuid not null references public.profiles(id),
  decision public.lead_status not null check(decision in ('Accepted','Returned for Clarification','Rejected')),
  remarks text not null default '' check(length(remarks)<=4000),
  reviewed_at timestamptz not null default now(),
  check(decision='Accepted' or length(trim(remarks))>0)
);
-- Origin and personnel history are separate from the pipeline-safe project table.
create table public.project_origins (
  project_id uuid primary key references public.projects(id),
  lead_id uuid not null unique references public.leads(id),
  primary_bdm_id uuid not null references public.profiles(id)
);
create table public.project_assignment_events (
  id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
  actor_id uuid not null references public.profiles(id), reason text not null,
  previous_assignments jsonb not null, new_assignments jsonb not null,
  occurred_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), recipient_id uuid not null references public.profiles(id),
  lead_id uuid references public.leads(id), project_id uuid references public.projects(id),
  message text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index leads_owner_status_idx on public.leads(bdm_id,status,updated_at desc);
create index leads_review_queue_idx on public.leads(status,last_submitted_at) where status='Submitted';
create index lead_submission_history_idx on public.lead_submissions(lead_id,number desc);
create index lead_reviews_history_idx on public.lead_reviews(lead_id,reviewed_at desc);
create index notifications_recipient_idx on public.notifications(recipient_id,created_at desc);
create unique index one_primary_per_project_role on public.project_memberships(project_id,membership_role) where is_primary;

create function private.require_role(allowed public.app_role[]) returns public.app_role
language plpgsql security definer set search_path='' as $$
declare r public.app_role; enabled boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role,active into r,enabled from public.profiles where id=auth.uid() for share;
  if not coalesce(enabled,false) or not coalesce(r=any(allowed),false) then raise exception 'ACCESS_DENIED'; end if;
  return r;
end; $$;
revoke all on function private.require_role(public.app_role[]) from public,anon,authenticated;
create function private.can_read_lead(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.leads l where l.id=target and (
   (private.current_role()='bdm' and l.bdm_id=auth.uid()) or
   (private.current_role() in ('lead_designer','system_administrator') and (l.status<>'Draft' or l.first_submitted_at is not null))
 ));
$$;
revoke all on function private.can_read_lead(uuid) from public,anon;
grant execute on function private.can_read_lead(uuid) to authenticated;
create or replace function private.can_read_pipeline(target_project uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and (
   private.current_role()='system_administrator' or
   (private.current_role()='lead_designer' and exists(select 1 from public.projects p where p.id=target_project and p.lead_designer_id=auth.uid())) or
   exists(select 1 from public.project_memberships m where m.project_id=target_project and m.user_id=auth.uid()
     and (m.membership_role=private.current_role() or (private.current_role()='lead_designer' and m.membership_role='designer')))
 );
$$;
alter table public.leads enable row level security;
alter table public.lead_submissions enable row level security;
alter table public.lead_reviews enable row level security;
alter table public.project_origins enable row level security;
alter table public.project_assignment_events enable row level security;
alter table public.notifications enable row level security;
revoke all on public.leads,public.lead_submissions,public.lead_reviews,public.project_origins,public.project_assignment_events,public.notifications from anon,authenticated;
grant select on public.leads,public.lead_submissions,public.lead_reviews,public.project_origins,public.project_assignment_events,public.notifications to authenticated;
create policy lead_read on public.leads for select to authenticated using(private.can_read_lead(id));
create policy submission_read on public.lead_submissions for select to authenticated using(private.can_read_lead(lead_id));
create policy review_read on public.lead_reviews for select to authenticated using(private.can_read_lead(lead_id));
create policy origin_read on public.project_origins for select to authenticated using(private.current_role()<>'operations_admin' and private.can_read_pipeline(project_id));
create policy assignment_history_read on public.project_assignment_events for select to authenticated using(private.current_role()<>'operations_admin' and private.can_read_pipeline(project_id));
create policy notification_read on public.notifications for select to authenticated using(recipient_id=auth.uid() and private.current_role() is not null);
drop policy membership_read on public.project_memberships;
create policy membership_read on public.project_memberships for select to authenticated using(
 private.can_read_pipeline(project_id) and (private.current_role()<>'operations_admin' or user_id=auth.uid())
);
create trigger immutable_submissions before update or delete on public.lead_submissions for each row execute function private.reject_audit_mutation();
create trigger immutable_reviews before update or delete on public.lead_reviews for each row execute function private.reject_audit_mutation();
create trigger immutable_assignments before update or delete on public.project_assignment_events for each row execute function private.reject_audit_mutation();

create function private.find_duplicate_leads(p_name text,p_address text,p_exclude uuid default null)
returns table(id uuid,reference text,project_name text,status public.lead_status)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['bdm']::public.app_role[]);
 return query select l.id,l.reference,l.project_name,l.status from public.leads l
 where l.bdm_id=auth.uid() and l.id is distinct from p_exclude and l.status<>'Rejected'
 and ((length(trim(p_name))>0 and lower(trim(l.project_name))=lower(trim(p_name)))
 or (length(trim(p_address))>0 and lower(trim(l.address))=lower(trim(p_address))))
 order by l.created_at desc limit 10;
end; $$;

create function private.save_lead(p_id uuid,p_expected_version integer,p_payload jsonb,p_submit boolean,p_duplicate_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.leads; old_record jsonb; n text; a text; b text; c integer; d date; files jsonb; f jsonb;
begin
 perform private.require_role(array['bdm']::public.app_role[]);
 n:=trim(coalesce(p_payload->>'project_name','')); a:=trim(coalesce(p_payload->>'address','')); b:=nullif(p_payload->>'brand','');
 c:=nullif(p_payload->>'cabinetry_count','')::integer; d:=nullif(p_payload->>'date_needed','')::date;
 files:=coalesce(p_payload->'attachment_metadata','[]'::jsonb);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_submit is null or p_expected_version is null or p_expected_version<0 or p_id is null
 or length(n)>200 or length(a)>2000 or length(coalesce(p_payload->>'notes',''))>10000 or length(coalesce(p_duplicate_reason,''))>2000
 or (b is not null and b not in ('SFY','Stosa','Both')) or (c is not null and c<1)
 or (p_submit and (n='' or a='' or c is null)) then raise exception 'INVALID_LEAD'; end if;
 if jsonb_typeof(files)<>'array' or jsonb_array_length(files)>5 then raise exception 'INVALID_ATTACHMENT_METADATA'; end if;
 for f in select value from jsonb_array_elements(files) loop
   if jsonb_typeof(f)<>'object' or length(trim(coalesce(f->>'name','')))=0 or length(f->>'name')>255
   or length(coalesce(f->>'mime_type',''))>150 or (f->>'size') is null
   or (f->>'size')::bigint<0 or (f->>'size')::bigint>104857600
   or coalesce(f->>'state','')<>'not_uploaded' then raise exception 'INVALID_ATTACHMENT_METADATA'; end if;
 end loop;
 -- Warn only about caller-visible records; do not leak other clients' names.
 if p_submit and length(trim(coalesce(p_duplicate_reason,'')))=0 and exists(select 1 from public.find_duplicate_leads(n,a,p_id)) then raise exception 'DUPLICATE_REASON_REQUIRED'; end if;
 insert into public.leads(id,bdm_id) values(p_id,auth.uid()) on conflict(id) do nothing;
 select * into l from public.leads where id=p_id for update;
 if l.bdm_id<>auth.uid() then raise exception 'ACCESS_DENIED'; end if;
 if p_expected_version is null or l.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if l.status not in ('Draft','Returned for Clarification') then raise exception 'INVALID_LEAD_STATE'; end if;
 old_record:=to_jsonb(l);
 update public.leads set project_name=n,address=a,brand=b,cabinetry_count=c,notes=coalesce(p_payload->>'notes',''),date_needed=d,
 attachment_metadata=files,status=case when p_submit then 'Submitted'::public.lead_status else l.status end,
 version=l.version+1,submission_count=l.submission_count+case when p_submit then 1 else 0 end,
 first_submitted_at=case when p_submit then coalesce(l.first_submitted_at,now()) else l.first_submitted_at end,
 last_submitted_at=case when p_submit then now() else l.last_submitted_at end,updated_at=now()
 where id=p_id returning * into l;
 if p_submit then
   insert into public.lead_submissions(lead_id,number,snapshot,submitted_by)
   values(l.id,l.submission_count,to_jsonb(l)||jsonb_build_object('duplicate_override_reason',trim(coalesce(p_duplicate_reason,''))),auth.uid());
   insert into public.notifications(recipient_id,lead_id,message)
   select id,l.id,'A submitted lead is ready for review.' from public.profiles where active and role='lead_designer';
 end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),'lead',l.id,case when p_submit then 'lead.submitted' else 'lead.draft_saved' end,old_record,to_jsonb(l));
 return l.id;
end; $$;

create function private.list_assignable_people() returns table(id uuid,display_name text,role public.app_role)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 return query select p.id,p.display_name,p.role from public.profiles p where p.active and p.role in ('designer','lead_designer','operations_admin') order by p.display_name,p.id;
end; $$;

create function private.set_project_assignments(p_project uuid,p_primary uuid,p_support uuid[],p_ops uuid[],p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous jsonb; current_members jsonb; u uuid;
begin
 if p_primary is null or length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 or coalesce(cardinality(p_support),0)>50 or coalesce(cardinality(p_ops),0)>50 then raise exception 'INVALID_ASSIGNMENTS'; end if;
 -- Lock assigned profiles so deactivation/role changes cannot race assignment validation.
 for u in select distinct x from unnest(array[p_primary]||coalesce(p_support,'{}'::uuid[])||coalesce(p_ops,'{}'::uuid[])) x order by x loop
   perform 1 from public.profiles where id=u and active for share;
   if not found then raise exception 'INVALID_ASSIGNEE'; end if;
 end loop;
 if not exists(select 1 from public.profiles where id=p_primary and role in ('designer','lead_designer'))
 or exists(select 1 from unnest(coalesce(p_support,'{}'::uuid[])) s where not exists(select 1 from public.profiles where id=s and role in ('designer','lead_designer')))
 or exists(select 1 from unnest(coalesce(p_ops,'{}'::uuid[])) s where not exists(select 1 from public.profiles where id=s and role='operations_admin')) then raise exception 'INVALID_ASSIGNEE'; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id,m.membership_role),'[]') into previous from public.project_memberships m where project_id=p_project;
 delete from public.project_memberships where project_id=p_project and membership_role in ('designer','operations_admin');
 insert into public.project_memberships(project_id,user_id,membership_role,is_primary) values(p_project,p_primary,'designer',true);
 insert into public.project_memberships(project_id,user_id,membership_role,is_primary)
 select p_project,s,'designer',false from (select distinct unnest(coalesce(p_support,'{}'::uuid[])) s) a where s<>p_primary;
 insert into public.project_memberships(project_id,user_id,membership_role,is_primary)
 select p_project,s,'operations_admin',s=p_ops[1] from (select distinct unnest(coalesce(p_ops,'{}'::uuid[])) s) a;
 select jsonb_agg(to_jsonb(m) order by m.user_id,m.membership_role) into current_members from public.project_memberships m where project_id=p_project;
 insert into public.project_assignment_events(project_id,actor_id,reason,previous_assignments,new_assignments) values(p_project,auth.uid(),trim(p_reason),previous,current_members);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'project',p_project,'project.assignments_changed',previous,jsonb_build_object('assignments',current_members,'reason',trim(p_reason)));
 insert into public.notifications(recipient_id,project_id,message)
 select distinct m.user_id,p_project,'Your project assignment has been updated.' from public.project_memberships m where project_id=p_project and m.user_id<>auth.uid();
end; $$;
revoke all on function private.set_project_assignments(uuid,uuid,uuid[],uuid[],text) from public,anon,authenticated;

create function private.review_lead(p_id uuid,p_expected_version integer,p_decision public.lead_status,p_remarks text default '',p_primary uuid default null,p_support uuid[] default '{}',p_ops uuid[] default '{}',p_lead_designer uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.leads; old_record jsonb; r public.app_role; project uuid; designer uuid; submission uuid;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select * into l from public.leads where id=p_id for update;
 if not found then raise exception 'LEAD_NOT_FOUND'; end if;
 if p_decision='Accepted' and l.status='Accepted' then select project_id into project from public.project_origins where lead_id=p_id; return project; end if;
 if l.status<>'Submitted' then raise exception 'INVALID_LEAD_STATE'; end if;
 if p_expected_version is null or l.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if p_decision is null or p_decision not in ('Accepted','Returned for Clarification','Rejected') or length(coalesce(p_remarks,''))>4000
 or (p_decision<>'Accepted' and length(trim(coalesce(p_remarks,'')))=0) then raise exception 'REMARKS_REQUIRED'; end if;
 select id into submission from public.lead_submissions where lead_id=p_id and number=l.submission_count;
 old_record:=to_jsonb(l);
 if p_decision='Accepted' then
   designer:=case when r='lead_designer' then auth.uid() else p_lead_designer end;
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
end; $$;

create function private.assign_project_personnel(p_project uuid,p_primary uuid,p_support uuid[],p_ops uuid[],p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.app_role; owner uuid; stage public.commercial_status;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select lead_designer_id,commercial_status into owner,stage from public.projects where id=p_project for update;
 if not found or (r<>'system_administrator' and owner<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if stage='Closed' and coalesce(cardinality(p_ops),0)=0 then raise exception 'OPERATIONS_ADMIN_REQUIRED'; end if;
 perform private.set_project_assignments(p_project,p_primary,p_support,p_ops,p_reason);
end; $$;

create function private.project_team(p_project uuid) returns table(user_id uuid,display_name text,membership_role public.app_role,is_primary boolean)
language plpgsql security definer set search_path='' as $$
begin
 if not private.can_read_pipeline(p_project) or private.current_role()='operations_admin' then raise exception 'ACCESS_DENIED'; end if;
 return query select m.user_id,p.display_name,m.membership_role,m.is_primary from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project order by m.membership_role,m.is_primary desc,p.display_name;
end; $$;

create function private.update_user_access(p_user uuid,p_role public.app_role,p_active boolean,p_name text,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare previous jsonb;
begin
 perform pg_advisory_xact_lock(813003);
 perform private.require_role(array['system_administrator']::public.app_role[]);
 if p_role is null or p_active is null or length(trim(coalesce(p_name,'')))=0 or length(p_name)>200 or length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'INVALID_USER_CHANGE'; end if;
 if p_user=auth.uid() and (p_role<>'system_administrator' or not p_active) then raise exception 'SELF_ACCESS_CHANGE_DENIED'; end if;
 select to_jsonb(p) into previous from public.profiles p where id=p_user for update;
 if not found then raise exception 'USER_NOT_FOUND'; end if;
 update public.profiles set role=p_role,active=p_active,display_name=trim(p_name) where id=p_user;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),'profile',p_user,'user.access_changed',previous,jsonb_build_object('role',p_role,'active',p_active,'display_name',trim(p_name),'reason',trim(p_reason)));
end; $$;

create function private.record_security_event(p_event text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid()) then raise exception 'AUTH_REQUIRED'; end if;
 if p_event not in ('auth.sign_in','auth.sign_out','auth.sign_in_denied','auth.password_set') or p_event is null then raise exception 'INVALID_SECURITY_EVENT'; end if;
 if p_event in ('auth.sign_in','auth.password_set') and private.current_role() is null then raise exception 'ACCESS_DENIED'; end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action) values(auth.uid(),'profile',auth.uid(),p_event);
end; $$;
create function private.record_invitation_request(p_email text,p_role public.app_role) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['system_administrator']::public.app_role[]);
 if p_role is null or p_email is null or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then raise exception 'INVALID_INVITATION'; end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,new_value) values(auth.uid(),'profile',auth.uid(),'user.invitation_requested',jsonb_build_object('email',lower(trim(p_email)),'role',p_role));
end; $$;
create function private.mark_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(enum_range(null::public.app_role));
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=auth.uid();
 if not found then raise exception 'ACCESS_DENIED'; end if;
end; $$;

create index lead_submitted_by_idx on public.lead_submissions(submitted_by);
create index review_reviewer_idx on public.lead_reviews(reviewer_id);
create index origins_bdm_idx on public.project_origins(primary_bdm_id);
create index assignment_project_time_idx on public.project_assignment_events(project_id,occurred_at desc);
create index assignment_actor_idx on public.project_assignment_events(actor_id);
create index notification_lead_idx on public.notifications(lead_id);
create index notification_project_idx on public.notifications(project_id);
create index audit_actor_idx on public.audit_events(actor_id);
create index audit_entity_time_idx on public.audit_events(entity_type,entity_id,occurred_at desc);
create index profiles_assignment_directory_idx on public.profiles(role,active,display_name);
create index leads_duplicate_name_idx on public.leads(bdm_id,lower(trim(project_name))) where status<>'Rejected';
create index leads_duplicate_address_idx on public.leads(bdm_id,lower(trim(address))) where status<>'Rejected';

-- Public RPCs are invoker wrappers; privileged implementations stay in the unexposed private schema.
create function public.find_duplicate_leads(p_name text,p_address text,p_exclude uuid default null) returns table(id uuid,reference text,project_name text,status public.lead_status)
language sql security invoker set search_path='' as $$ select * from private.find_duplicate_leads($1,$2,$3); $$;
revoke all on function private.find_duplicate_leads(text,text,uuid) from public,anon;
grant execute on function private.find_duplicate_leads(text,text,uuid) to authenticated;
create function public.save_lead(p_id uuid,p_expected_version integer,p_payload jsonb,p_submit boolean,p_duplicate_reason text default '') returns uuid
language sql security invoker set search_path='' as $$ select private.save_lead($1,$2,$3,$4,$5); $$;
revoke all on function private.save_lead(uuid,integer,jsonb,boolean,text) from public,anon;
grant execute on function private.save_lead(uuid,integer,jsonb,boolean,text) to authenticated;
create function public.list_assignable_people() returns table(id uuid,display_name text,role public.app_role)
language sql security invoker set search_path='' as $$ select * from private.list_assignable_people(); $$;
revoke all on function private.list_assignable_people() from public,anon;
grant execute on function private.list_assignable_people() to authenticated;
create function public.review_lead(p_id uuid,p_expected_version integer,p_decision public.lead_status,p_remarks text default '',p_primary uuid default null,p_support uuid[] default '{}',p_ops uuid[] default '{}',p_lead_designer uuid default null) returns uuid
language sql security invoker set search_path='' as $$ select private.review_lead($1,$2,$3,$4,$5,$6,$7,$8); $$;
revoke all on function private.review_lead(uuid,integer,public.lead_status,text,uuid,uuid[],uuid[],uuid) from public,anon;
grant execute on function private.review_lead(uuid,integer,public.lead_status,text,uuid,uuid[],uuid[],uuid) to authenticated;
create function public.assign_project_personnel(p_project uuid,p_primary uuid,p_support uuid[],p_ops uuid[],p_reason text) returns void
language sql security invoker set search_path='' as $$ select private.assign_project_personnel($1,$2,$3,$4,$5); $$;
revoke all on function private.assign_project_personnel(uuid,uuid,uuid[],uuid[],text) from public,anon;
grant execute on function private.assign_project_personnel(uuid,uuid,uuid[],uuid[],text) to authenticated;
create function public.project_team(p_project uuid) returns table(user_id uuid,display_name text,membership_role public.app_role,is_primary boolean)
language sql security invoker set search_path='' as $$ select * from private.project_team($1); $$;
revoke all on function private.project_team(uuid) from public,anon;
grant execute on function private.project_team(uuid) to authenticated;
create function public.update_user_access(p_user uuid,p_role public.app_role,p_active boolean,p_name text,p_reason text) returns void
language sql security invoker set search_path='' as $$ select private.update_user_access($1,$2,$3,$4,$5); $$;
revoke all on function private.update_user_access(uuid,public.app_role,boolean,text,text) from public,anon;
grant execute on function private.update_user_access(uuid,public.app_role,boolean,text,text) to authenticated;
create function public.record_security_event(p_event text) returns void
language sql security invoker set search_path='' as $$ select private.record_security_event($1); $$;
revoke all on function private.record_security_event(text) from public,anon;
grant execute on function private.record_security_event(text) to authenticated;
create function public.record_invitation_request(p_email text,p_role public.app_role) returns void
language sql security invoker set search_path='' as $$ select private.record_invitation_request($1,$2); $$;
revoke all on function private.record_invitation_request(text,public.app_role) from public,anon;
grant execute on function private.record_invitation_request(text,public.app_role) to authenticated;
create function public.mark_notification_read(p_id uuid) returns void
language sql security invoker set search_path='' as $$ select private.mark_notification_read($1); $$;
revoke all on function private.mark_notification_read(uuid) from public,anon;
grant execute on function private.mark_notification_read(uuid) to authenticated;

-- Only explicitly approved RPCs are exposed to signed-in callers. No direct writes.
revoke all on function public.find_duplicate_leads(text,text,uuid),public.save_lead(uuid,integer,jsonb,boolean,text),public.list_assignable_people(),public.review_lead(uuid,integer,public.lead_status,text,uuid,uuid[],uuid[],uuid),public.assign_project_personnel(uuid,uuid,uuid[],uuid[],text),public.project_team(uuid),public.update_user_access(uuid,public.app_role,boolean,text,text),public.record_security_event(text),public.record_invitation_request(text,public.app_role),public.mark_notification_read(uuid) from public,anon;
grant execute on function public.find_duplicate_leads(text,text,uuid),public.save_lead(uuid,integer,jsonb,boolean,text),public.list_assignable_people(),public.review_lead(uuid,integer,public.lead_status,text,uuid,uuid[],uuid[],uuid),public.assign_project_personnel(uuid,uuid,uuid[],uuid[],text),public.project_team(uuid),public.update_user_access(uuid,public.app_role,boolean,text,text),public.record_security_event(text),public.record_invitation_request(text,public.app_role),public.mark_notification_read(uuid) to authenticated;
commit;
