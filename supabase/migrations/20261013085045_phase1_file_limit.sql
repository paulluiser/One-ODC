begin;
create or replace function private.save_lead(p_id uuid,p_expected_version integer,p_payload jsonb,p_submit boolean,p_duplicate_reason text default '') returns uuid
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
 attachment_metadata=files,status=case when p_submit then 'Submitted'::public.lead_status else l.status end,
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

alter table public.attachment_versions drop constraint attachment_versions_expected_size_check;
alter table public.attachment_versions add constraint attachment_versions_expected_size_check check(expected_size between 1 and 52428800);
commit;
