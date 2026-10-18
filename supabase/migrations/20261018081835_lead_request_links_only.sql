-- New quotation-request files are HTTPS resource links. Historical files remain readable.
-- Keep Project uploads and the existing archive/restore and authorization rules intact.
do $$ declare definition text; marker text:=' target:=gen_random_uuid();'; begin
 definition:=pg_get_functiondef('private.reserve_attachment(uuid,uuid,uuid,text,text,text,bigint)'::regprocedure);
 if position(marker in definition)=0 then raise exception 'RESERVATION_PATCH_MISSING'; end if;
 definition:=replace(definition,marker,' if a.lead_id is not null and not exists(select 1 from public.project_origins where lead_id=a.lead_id) then raise exception ''LEAD_LINKS_ONLY''; end if;'||marker);
 execute definition;
end $$;
create or replace function private.can_upload_attachment_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachment_versions v join public.attachments a on a.id=v.attachment_id
 where v.object_path=p_path and v.created_by=(select auth.uid()) and v.ready_at is null and v.created_at>now()-interval '24 hours'
 and a.archived_at is null and (a.lead_id is null or exists(select 1 from public.project_origins o where o.lead_id=a.lead_id)) and private.attachment_scope(a.lead_id,a.project_id,a.classification,true)
 and (exists(select 1 from public.attachment_versions old where old.attachment_id=a.id and old.ready_at is not null)
 or (private.attachment_slots(a.lead_id,a.project_id)->>'uploaded')::integer<3))
$$;
