-- Lead requests have one explicit recipient; Projects retain one current Lead Designer.
alter table public.leads add column assigned_lead_designer_id uuid references public.profiles(id);
create index leads_assigned_lead_designer on public.leads(assigned_lead_designer_id,status);
-- Preserve known ownership. Never guess a recipient for historical unconverted requests.
update public.leads l set assigned_lead_designer_id=p.lead_designer_id
from public.project_origins o join public.projects p on p.id=o.project_id where o.lead_id=l.id and p.commercial_status<>'Lost';
create unique index one_project_lead_designer on public.project_memberships(project_id) where membership_role='lead_designer';

create or replace function private.can_read_lead(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.leads l where l.id=target and (
  (private.current_role()='bdm' and l.bdm_id=auth.uid()) or
  (private.current_role()='system_administrator' and (l.status<>'Draft' or l.first_submitted_at is not null)) or
  (private.current_role()='lead_designer' and (l.status<>'Draft' or l.first_submitted_at is not null)
   and coalesce((select p.lead_designer_id from public.project_origins o join public.projects p on p.id=o.project_id where o.lead_id=l.id),l.assigned_lead_designer_id)=auth.uid())
 ));
$$;
-- Narrow directory for BDM routing: names and IDs only, never account/Auth details.
create function private.list_lead_designers() returns table(id uuid,display_name text,role public.app_role)
language plpgsql stable security definer set search_path='' as $$
begin
 perform private.require_role(array['bdm','lead_designer','system_administrator']::public.app_role[]);
 return query select p.id,p.display_name,p.role from public.profiles p where p.active and p.role='lead_designer' order by p.display_name,p.id;
end $$;
create function public.list_lead_designers() returns table(id uuid,display_name text,role public.app_role)
language sql security invoker set search_path='' as $$select * from private.list_lead_designers()$$;
revoke all on function private.list_lead_designers(),public.list_lead_designers() from public,anon;
grant execute on function private.list_lead_designers(),public.list_lead_designers() to authenticated;

create or replace function private.save_lead(p_id uuid,p_expected_version integer,p_payload jsonb,p_submit boolean,p_duplicate_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.leads; old_record jsonb; n text; a text; b text; c integer; d date; files jsonb; f jsonb; recipient uuid;
begin
 perform private.require_role(array['bdm']::public.app_role[]);
 recipient:=nullif(p_payload->>'assigned_lead_designer_id','')::uuid;
 if p_submit and recipient is null then raise exception 'INVALID_LEAD_DESIGNER'; end if;
 if recipient is not null then
  perform 1 from public.profiles where id=recipient and active and role='lead_designer' for share;
  if not found then raise exception 'INVALID_LEAD_DESIGNER'; end if;
 end if;
 n:=trim(coalesce(p_payload->>'project_name','')); a:=trim(coalesce(p_payload->>'address','')); b:=nullif(p_payload->>'brand','');
 c:=nullif(p_payload->>'cabinetry_count','')::integer; d:=nullif(p_payload->>'date_needed','')::date;
 if not private.valid_resource_links(coalesce(p_payload->'resource_links','[]'::jsonb)) then raise exception 'INVALID_RESOURCE_LINKS'; end if;
 files:=coalesce(p_payload->'attachment_metadata','[]'::jsonb);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_submit is null or p_expected_version is null or p_expected_version<0 or p_id is null
 or length(n)>200 or length(a)>2000 or length(coalesce(p_payload->>'notes',''))>10000 or length(coalesce(p_duplicate_reason,''))>2000
 or (b is not null and b not in ('SFY','Stosa','Both')) or (c is not null and c<1)
 or (p_submit and (n='' or a='' or c is null)) then raise exception 'INVALID_LEAD'; end if;
 if jsonb_typeof(files)<>'array' or jsonb_array_length(files)>5 then raise exception 'INVALID_ATTACHMENT_METADATA'; end if;
 for f in select value from jsonb_array_elements(files) loop
   if jsonb_typeof(f)<>'object' or length(trim(coalesce(f->>'name','')))=0 or length(f->>'name')>255
   or length(coalesce(f->>'mime_type',''))>150 or (f->>'size') is null
   or (f->>'size')::bigint<0 or (f->>'size')::bigint>52428800
   or coalesce(f->>'state','')<>'not_uploaded' then raise exception 'INVALID_ATTACHMENT_METADATA'; end if;
 end loop;
 -- Warn only about caller-visible records; do not leak other clients' names.
 if p_submit and length(trim(coalesce(p_duplicate_reason,'')))=0 and exists(select 1 from public.find_duplicate_leads(n,a,p_id)) then raise exception 'DUPLICATE_REASON_REQUIRED'; end if;
 insert into public.leads(id,bdm_id) values(p_id,auth.uid()) on conflict(id) do nothing;
 select * into l from public.leads where id=p_id for update;
 if l.bdm_id<>auth.uid() then raise exception 'ACCESS_DENIED'; end if;
 if p_expected_version is null or l.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if l.status not in ('Draft','Returned for Clarification') then raise exception 'INVALID_LEAD_STATE'; end if;
 if p_submit and exists(select 1 from public.attachments a join public.attachment_versions v on v.attachment_id=a.id where a.lead_id=l.id and a.archived_at is null and v.ready_at is null) then raise exception 'UPLOADS_PENDING'; end if;
 old_record:=to_jsonb(l);
 update public.leads set assigned_lead_designer_id=recipient,project_name=n,address=a,brand=b,cabinetry_count=c,notes=coalesce(p_payload->>'notes',''),date_needed=d,
 resource_links=coalesce(p_payload->'resource_links','[]'::jsonb),attachment_metadata=files,status=case when p_submit then 'Submitted'::public.lead_status else l.status end,
 version=l.version+1,submission_count=l.submission_count+case when p_submit then 1 else 0 end,
 first_submitted_at=case when p_submit then coalesce(l.first_submitted_at,now()) else l.first_submitted_at end,
 last_submitted_at=case when p_submit then now() else l.last_submitted_at end,updated_at=now()
 where id=p_id returning * into l;
 if p_submit then
   insert into public.lead_submissions(lead_id,number,snapshot,submitted_by)
   values(l.id,l.submission_count,to_jsonb(l)||jsonb_build_object('duplicate_override_reason',trim(coalesce(p_duplicate_reason,'')),'uploaded_attachments',coalesce((select jsonb_agg(to_jsonb(x)) from (select distinct on (a.id) a.id as attachment_id,v.id as version_id,v.original_name,v.actual_size from public.attachments a join public.attachment_versions v on v.attachment_id=a.id where a.lead_id=l.id and a.archived_at is null and v.ready_at is not null order by a.id,v.created_at desc) x),'[]'::jsonb)),auth.uid());
   insert into public.notifications(recipient_id,lead_id,message)
   select id,l.id,'A submitted lead is ready for review.' from public.profiles where id=recipient and active and role='lead_designer';
 end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),'lead',l.id,case when p_submit then 'lead.submitted' else 'lead.draft_saved' end,old_record,to_jsonb(l));
 return l.id;
end; $$;

create or replace function private.review_lead(p_id uuid,p_expected_version integer,p_decision public.lead_status,p_remarks text default '',p_primary uuid default null,p_support uuid[] default '{}',p_ops uuid[] default '{}',p_lead_designer uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
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
end; $$;


-- Recover legacy unassigned requests, or explicitly transfer a pending request.
create function private.route_lead(p_lead uuid,p_expected_version integer,p_designer uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare l public.leads; r public.app_role;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select * into l from public.leads where id=p_lead for update;
 if not found or (r<>'system_administrator' and l.assigned_lead_designer_id is distinct from auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if l.status not in ('Submitted','Returned for Clarification') then raise exception 'INVALID_LEAD_STATE'; end if;
 if l.version is distinct from p_expected_version then raise exception 'STALE_VERSION'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 perform 1 from public.profiles where id=p_designer and active and role='lead_designer' for share;
 if not found then raise exception 'INVALID_LEAD_DESIGNER'; end if;
 if l.assigned_lead_designer_id=p_designer then return; end if;
 update public.leads set assigned_lead_designer_id=p_designer,version=version+1,updated_at=now() where id=p_lead;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),'lead',p_lead,'lead.recipient_changed',to_jsonb(l),jsonb_build_object('assigned_lead_designer_id',p_designer,'reason',trim(p_reason)));
 if l.status='Submitted' then
  insert into public.notifications(recipient_id,lead_id,message) values(p_designer,p_lead,'A quotation request has been assigned to you for review.');
 end if;
end $$;
create function public.route_lead(p_lead uuid,p_expected_version integer,p_designer uuid,p_reason text) returns void
language sql security invoker set search_path='' as $$select private.route_lead($1,$2,$3,$4)$$;
revoke all on function private.route_lead(uuid,integer,uuid,text),public.route_lead(uuid,integer,uuid,text) from public,anon;
grant execute on function private.route_lead(uuid,integer,uuid,text),public.route_lead(uuid,integer,uuid,text) to authenticated;

create function private.assign_project_lead_designer(p_project uuid,p_expected_designer uuid,p_designer uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.projects; r public.app_role; previous jsonb; current_members jsonb;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select * into p from public.projects where id=p_project for update;
 if not found or (r<>'system_administrator' and p.lead_designer_id<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 perform private.assert_project_not_lost(p_project);
 if p.is_cancelled or p.is_operationally_completed then raise exception 'INVALID_PROJECT_STATE'; end if;
 if p.lead_designer_id is distinct from p_expected_designer then raise exception 'STALE_VERSION'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 perform 1 from public.profiles where id=p_designer and active and role='lead_designer' for share;
 if not found then raise exception 'INVALID_LEAD_DESIGNER'; end if;
 if p.lead_designer_id=p_designer then return; end if;
 select coalesce(jsonb_agg(to_jsonb(m) order by m.user_id,m.membership_role),'[]') into previous from public.project_memberships m where project_id=p_project;
 delete from public.project_memberships where project_id=p_project and membership_role='lead_designer';
 update public.projects set lead_designer_id=p_designer where id=p_project;
 insert into public.project_memberships(project_id,user_id,membership_role,is_primary) values(p_project,p_designer,'lead_designer',true);
 select jsonb_agg(to_jsonb(m) order by m.user_id,m.membership_role) into current_members from public.project_memberships m where project_id=p_project;
 insert into public.project_assignment_events(project_id,actor_id,reason,previous_assignments,new_assignments) values(p_project,auth.uid(),trim(p_reason),previous,current_members);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'project',p_project,'project.lead_designer_changed',jsonb_build_object('lead_designer_id',p.lead_designer_id),jsonb_build_object('lead_designer_id',p_designer,'reason',trim(p_reason)));
 insert into public.notifications(recipient_id,project_id,message)
 select distinct x,p_project,'The project Lead Designer assignment has changed.' from unnest(array[p.lead_designer_id,p_designer]) x;
end $$;
create function public.assign_project_lead_designer(p_project uuid,p_expected_designer uuid,p_designer uuid,p_reason text) returns void
language sql security invoker set search_path='' as $$select private.assign_project_lead_designer($1,$2,$3,$4)$$;
revoke all on function private.assign_project_lead_designer(uuid,uuid,uuid,text),public.assign_project_lead_designer(uuid,uuid,uuid,text) from public,anon;
grant execute on function private.assign_project_lead_designer(uuid,uuid,uuid,text),public.assign_project_lead_designer(uuid,uuid,uuid,text) to authenticated;

-- Definer analytics must explicitly use the same recipient scope as table RLS.
do $$ declare definition text; old_scope text:='(not exists(select 1 from public.project_origins o where o.lead_id=l.id) or exists(select 1 from public.project_origins o join authorized p on p.id=o.project_id where o.lead_id=l.id))'; begin
 definition:=pg_get_functiondef('private.project_analytics(date,date,text,text,uuid,text,text,integer)'::regprocedure);
 if position(old_scope in definition)=0 then raise exception 'ANALYTICS_SCOPE_PATCH_MISSING'; end if;
 definition:=replace(definition,old_scope,'private.can_read_lead(l.id)');
 execute definition;
end $$;
