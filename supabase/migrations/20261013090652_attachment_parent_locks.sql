begin;
-- Lock parent before attachment and recheck access after waiting: submission cannot race a reservation/archive.
create or replace function private.reserve_attachment(p_attachment uuid,p_lead uuid,p_project uuid,p_class text,p_name text,p_mime text,p_size bigint)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.attachments; v public.attachment_versions; cap bigint; target uuid;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select file_size_limit into cap from storage.buckets where id='one-odc-attachments' and not public;
 if cap is null or p_size is null or p_size<1 or p_size>least(cap,104857600) then raise exception 'STORAGE_SIZE_LIMIT'; end if;
 if p_name is null or length(trim(p_name)) not between 1 and 255 or p_mime is null or length(p_mime)>150 then raise exception 'INVALID_FILE_METADATA'; end if;
 if p_attachment is null then
  if num_nonnulls(p_lead,p_project)<>1 or p_class is null or not private.attachment_scope(p_lead,p_project,p_class,true) then raise exception 'ACCESS_DENIED'; end if;
  if p_lead is not null then
   perform 1 from public.leads where id=p_lead for update;
   if (select count(*) from public.attachments where lead_id=p_lead and archived_at is null)>=5 then raise exception 'ATTACHMENT_COUNT_LIMIT'; end if;
  else perform 1 from public.projects where id=p_project for update; end if;
  if not private.attachment_scope(p_lead,p_project,p_class,true) then raise exception 'ACCESS_DENIED'; end if;
  insert into public.attachments(lead_id,project_id,classification,created_by) values(p_lead,p_project,p_class,auth.uid()) returning * into a;
 else
  select * into a from public.attachments where id=p_attachment;
  if not found or a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
  if a.lead_id is not null then perform 1 from public.leads where id=a.lead_id for update; else perform 1 from public.projects where id=a.project_id for update; end if;
  select * into a from public.attachments where id=p_attachment for update;
  if a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 end if;
 target:=gen_random_uuid();
 insert into public.attachment_versions(id,attachment_id,object_path,original_name,mime_type,expected_size,created_by)
 values(target,a.id,case when a.project_id is not null then 'projects/'||a.project_id else 'leads/'||a.lead_id end||'/attachments/'||a.id||'/versions/'||target,trim(p_name),p_mime,p_size,auth.uid()) returning * into v;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.upload_reserved',to_jsonb(v));
 return to_jsonb(v)||jsonb_build_object('bucket','one-odc-attachments','max_size',least(cap,104857600));
end $$;
create or replace function private.archive_attachment(p_id uuid,p_archive boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.attachments;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into a from public.attachments where id=p_id;
 if not found or p_archive is null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if a.lead_id is not null then perform 1 from public.leads where id=a.lead_id for update; else perform 1 from public.projects where id=a.project_id for update; end if;
 select * into a from public.attachments where id=p_id for update;
 if not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'REASON_REQUIRED'; end if;
 if not p_archive and a.lead_id is not null then
  perform 1 from public.leads where id=a.lead_id for update;
  if a.archived_at is not null and (select count(*) from public.attachments where lead_id=a.lead_id and archived_at is null)>=5 then raise exception 'ATTACHMENT_COUNT_LIMIT'; end if;
 end if;
 update public.attachments set archived_at=case when p_archive then now() else null end where id=a.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,case when p_archive then 'attachment.archived' else 'attachment.restored' end,jsonb_build_object('reason',trim(p_reason)));
end $$;
commit;
