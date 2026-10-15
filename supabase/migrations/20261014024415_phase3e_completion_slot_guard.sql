create or replace function private.complete_attachment(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.attachment_versions; a public.attachments; actual bigint;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into v from public.attachment_versions where id=p_version;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into a from public.attachments where id=v.attachment_id;
 perform private.lock_attachment_parent(a.lead_id,a.project_id);
 select * into v from public.attachment_versions where id=p_version for update;
 if not found or v.created_by<>auth.uid() then raise exception 'ACCESS_DENIED'; end if;
 select * into a from public.attachments where id=v.attachment_id for share;
 if a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if v.ready_at is not null then return; end if;
 if not exists(select 1 from public.attachment_versions where attachment_id=a.id and ready_at is not null) and (private.attachment_slots(a.lead_id,a.project_id)->>'uploaded')::integer>=3 then raise exception 'ATTACHMENT_COUNT_LIMIT'; end if;
 select (metadata->>'size')::bigint into actual from storage.objects where bucket_id='one-odc-attachments' and name=v.object_path;
 if actual is null or actual<>v.expected_size then raise exception 'STORAGE_OBJECT_NOT_VERIFIED'; end if;
 update public.attachment_versions set ready_at=now(),actual_size=actual where id=v.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.upload_completed',jsonb_build_object('version_id',v.id,'actual_size',actual));
end $$;

create or replace function private.can_upload_attachment_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachment_versions v join public.attachments a on a.id=v.attachment_id
 where v.object_path=p_path and v.created_by=(select auth.uid()) and v.ready_at is null and v.created_at>now()-interval '24 hours'
 and a.archived_at is null and private.attachment_scope(a.lead_id,a.project_id,a.classification,true)
 and (exists(select 1 from public.attachment_versions old where old.attachment_id=a.id and old.ready_at is not null)
 or (private.attachment_slots(a.lead_id,a.project_id)->>'uploaded')::integer<3))
$$;
