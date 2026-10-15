-- Phase 3E amendments: structured lead links, scoped Project notes/resources, shared file slots.
create function private.valid_resource_links(links jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; seen uuid[]:='{}'; identity uuid;
begin
 if links is null or jsonb_typeof(links)<>'array' or jsonb_array_length(links)>20 then return false; end if;
 for item in select value from jsonb_array_elements(links) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'url')<>'string' or length(item->>'url')>2048 or (item->>'url') !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([:][0-9]{1,5})?([/?#][^[:space:]\\]*)?$' then return false; end if;
  identity:=(item->>'id')::uuid;
  if identity is null or identity=any(seen) then return false; end if;
  seen:=array_append(seen,identity);
 end loop;
 return true;
exception when others then return false;
end $$;
revoke all on function private.valid_resource_links(jsonb) from public,anon,authenticated;
alter table public.leads add column resource_links jsonb not null default '[]'::jsonb check(private.valid_resource_links(resource_links));
create or replace function private.save_lead(p_id uuid,p_expected_version integer,p_payload jsonb,p_submit boolean,p_duplicate_reason text default '') returns uuid
language plpgsql security definer set search_path='' as $$
declare l public.leads; old_record jsonb; n text; a text; b text; c integer; d date; files jsonb; f jsonb;
begin
 perform private.require_role(array['bdm']::public.app_role[]);
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
 update public.leads set project_name=n,address=a,brand=b,cabinetry_count=c,notes=coalesce(p_payload->>'notes',''),date_needed=d,
 resource_links=coalesce(p_payload->'resource_links','[]'::jsonb),attachment_metadata=files,status=case when p_submit then 'Submitted'::public.lead_status else l.status end,
 version=l.version+1,submission_count=l.submission_count+case when p_submit then 1 else 0 end,
 first_submitted_at=case when p_submit then coalesce(l.first_submitted_at,now()) else l.first_submitted_at end,
 last_submitted_at=case when p_submit then now() else l.last_submitted_at end,updated_at=now()
 where id=p_id returning * into l;
 if p_submit then
   insert into public.lead_submissions(lead_id,number,snapshot,submitted_by)
   values(l.id,l.submission_count,to_jsonb(l)||jsonb_build_object('duplicate_override_reason',trim(coalesce(p_duplicate_reason,'')),'uploaded_attachments',coalesce((select jsonb_agg(to_jsonb(x)) from (select distinct on (a.id) a.id as attachment_id,v.id as version_id,v.original_name,v.actual_size from public.attachments a join public.attachment_versions v on v.attachment_id=a.id where a.lead_id=l.id and a.archived_at is null and v.ready_at is not null order by a.id,v.created_at desc) x),'[]'::jsonb)),auth.uid());
   insert into public.notifications(recipient_id,lead_id,message)
   select id,l.id,'A submitted lead is ready for review.' from public.profiles where active and role='lead_designer';
 end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),'lead',l.id,case when p_submit then 'lead.submitted' else 'lead.draft_saved' end,old_record,to_jsonb(l));
 return l.id;
end; $$;

-- One canonical lock covers inherited lead files and project files, including conversion races.
create function private.lock_attachment_parent(p_lead uuid,p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare origin uuid; project uuid:=p_project;
begin
 if p_lead is not null then origin:=p_lead;
 else select lead_id into origin from public.project_origins where project_id=p_project; end if;
 if origin is not null then
  perform 1 from public.leads where id=origin for update;
  select project_id into project from public.project_origins where lead_id=origin;
 end if;
 if project is not null then perform 1 from public.projects where id=project for update; end if;
 return origin;
end $$;
create function private.attachment_slots(p_lead uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare origin uuid:=p_lead; project uuid:=p_project; uploaded integer; reserved integer;
begin
 if origin is null then select lead_id into origin from public.project_origins where project_id=project;
 else select project_id into project from public.project_origins where lead_id=origin; end if;
 select count(*) filter(where exists(select 1 from public.attachment_versions v where v.attachment_id=a.id and v.ready_at is not null)),
 count(*) filter(where not exists(select 1 from public.attachment_versions v where v.attachment_id=a.id and v.ready_at is not null)) into uploaded,reserved
 from public.attachments a where a.archived_at is null and (a.lead_id=origin or a.project_id=project);
 return jsonb_build_object('uploaded',uploaded,'reserved',reserved,'remaining',greatest(0,3-uploaded-reserved));
end $$;
create function private.enforce_attachment_slots() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and (new.lead_id,new.project_id) is distinct from (old.lead_id,old.project_id) then raise exception 'HISTORY_IMMUTABLE'; end if;
 if new.archived_at is null and (TG_OP='INSERT' or old.archived_at is not null) then
  perform private.lock_attachment_parent(new.lead_id,new.project_id);
  if (private.attachment_slots(new.lead_id,new.project_id)->>'remaining')::integer=0 then raise exception 'ATTACHMENT_COUNT_LIMIT'; end if;
 end if;
 return new;
end $$;
create trigger attachment_slot_guard before insert or update on public.attachments for each row execute function private.enforce_attachment_slots();
create or replace function private.attachment_scope(p_lead uuid,p_project uuid,p_class text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.app_role; inherited uuid;
begin
 r:=private.current_role(); if r is null then return false; end if;
 if p_lead is not null then
  select project_id into inherited from public.project_origins where lead_id=p_lead;
  if inherited is not null then return private.attachment_scope(null,inherited,p_class,p_write); end if;
  if p_class<>'general' then return false; end if;
  if p_write then return exists(select 1 from public.leads where id=p_lead and bdm_id=auth.uid() and status in ('Draft','Returned for Clarification')) and r='bdm'; end if;
  return private.can_read_lead(p_lead);
 end if;
 if not private.can_read_pipeline(p_project) then return false; end if;
 if r='system_administrator' then return true; end if;
 if r='operations_admin' then return p_class='operations' and exists(select 1 from public.projects where id=p_project and commercial_status='Closed'); end if;
 if r='bdm' then return p_class='general'; end if;
 if r='designer' then return p_class in ('general','design'); end if;
 return r='lead_designer';
end $$;
create or replace function private.reserve_attachment(p_attachment uuid,p_lead uuid,p_project uuid,p_class text,p_name text,p_mime text,p_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attachments; v public.attachment_versions; cap bigint; target uuid;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select file_size_limit into cap from storage.buckets where id='one-odc-attachments' and not public;
 if cap is null or p_size is null or p_size<1 or p_size>least(cap,52428800) then raise exception 'STORAGE_SIZE_LIMIT'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 255 or p_mime is null or length(p_mime)>150 then raise exception 'INVALID_FILE_METADATA'; end if;
 if p_attachment is null then
  if num_nonnulls(p_lead,p_project)<>1 or p_class is null or not private.attachment_scope(p_lead,p_project,p_class,true) then raise exception 'ACCESS_DENIED'; end if;
  perform private.lock_attachment_parent(p_lead,p_project);
  if not private.attachment_scope(p_lead,p_project,p_class,true) then raise exception 'ACCESS_DENIED'; end if;
  insert into public.attachments(lead_id,project_id,classification,created_by) values(p_lead,p_project,p_class,auth.uid()) returning * into a;
 else
  select * into a from public.attachments where id=p_attachment;
  if not found or a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
  perform private.lock_attachment_parent(a.lead_id,a.project_id);
  select * into a from public.attachments where id=p_attachment for update;
  if a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 end if;
 target:=gen_random_uuid();
 insert into public.attachment_versions(id,attachment_id,object_path,original_name,mime_type,expected_size,created_by)
 values(target,a.id,case when a.project_id is not null then 'projects/'||a.project_id else 'leads/'||a.lead_id end||'/attachments/'||a.id||'/versions/'||target,trim(p_name),p_mime,p_size,auth.uid()) returning * into v;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.upload_reserved',to_jsonb(v));
 return to_jsonb(v)||jsonb_build_object('bucket','one-odc-attachments','max_size',least(cap,52428800));
end $$;
create or replace function private.archive_attachment(p_id uuid,p_archive boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.attachments;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into a from public.attachments where id=p_id;
 if not found or p_archive is null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 perform private.lock_attachment_parent(a.lead_id,a.project_id);
 select * into a from public.attachments where id=p_id for update;
 if not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'REASON_REQUIRED'; end if;
 update public.attachments set archived_at=case when p_archive then now() else null end where id=a.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,case when p_archive then 'attachment.archived' else 'attachment.restored' end,jsonb_build_object('reason',trim(p_reason)));
end $$;

create function private.get_attachment_slots(p_lead uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if num_nonnulls(p_lead,p_project)<>1 or not private.attachment_scope(p_lead,p_project,'general',false) then raise exception 'ACCESS_DENIED'; end if;
 return private.attachment_slots(p_lead,p_project);
end $$;
create function public.get_attachment_slots(p_lead uuid default null,p_project uuid default null) returns jsonb language sql security invoker set search_path='' as $$select private.get_attachment_slots(p_lead,p_project)$$;
create function private.project_resources(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare l public.leads;
begin
 if not private.attachment_scope(null,p_project,'general',false) then raise exception 'ACCESS_DENIED'; end if;
 select leads.* into l from public.leads join public.project_origins o on o.lead_id=leads.id where o.project_id=p_project;
 return jsonb_build_object('notes',l.notes,'resource_links',l.resource_links,'version',l.version,'lead_id',l.id);
end $$;
create function public.project_resources(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$select private.project_resources(p_project)$$;
create function private.update_project_resources(p_project uuid,p_version integer,p_notes text,p_links jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare l public.leads; previous jsonb;
begin
 perform private.lock_attachment_parent(null,p_project);
 if not (private.space_manager(p_project) or private.sale_editor(p_project)) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.projects where id=p_project and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 if p_notes is null or length(p_notes)>10000 or not private.valid_resource_links(p_links) then raise exception 'INVALID_RESOURCE_LINKS'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 select leads.* into l from public.leads join public.project_origins o on o.lead_id=leads.id where o.project_id=p_project for update of leads;
 if l.id is null or l.version is distinct from p_version then raise exception 'STALE_VERSION'; end if;
 previous:=jsonb_build_object('notes',l.notes,'resource_links',l.resource_links);
 update public.leads set notes=p_notes,resource_links=p_links,version=version+1,updated_at=now() where id=l.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'lead',l.id,'project.resources_changed',previous,jsonb_build_object('notes',p_notes,'resource_links',p_links,'reason',trim(p_reason)));
end $$;
create function public.update_project_resources(p_project uuid,p_version integer,p_notes text,p_links jsonb,p_reason text) returns void language sql security invoker set search_path='' as $$select private.update_project_resources(p_project,p_version,p_notes,p_links,p_reason)$$;
revoke all on function private.lock_attachment_parent(uuid,uuid),private.attachment_slots(uuid,uuid),private.enforce_attachment_slots(),private.get_attachment_slots(uuid,uuid),public.get_attachment_slots(uuid,uuid),private.project_resources(uuid),public.project_resources(uuid),private.update_project_resources(uuid,integer,text,jsonb,text),public.update_project_resources(uuid,integer,text,jsonb,text) from public,anon,authenticated;
grant execute on function private.get_attachment_slots(uuid,uuid),public.get_attachment_slots(uuid,uuid),private.project_resources(uuid),public.project_resources(uuid),private.update_project_resources(uuid,integer,text,jsonb,text),public.update_project_resources(uuid,integer,text,jsonb,text) to authenticated;
