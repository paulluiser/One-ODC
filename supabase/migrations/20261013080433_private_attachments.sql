begin;
-- Immutable objects; replacement always reserves a new version UUID/path.
insert into storage.buckets(id,name,public,file_size_limit) values('one-odc-attachments','one-odc-attachments',false,52428800);
create table public.attachments(
 id uuid primary key default gen_random_uuid(),
 lead_id uuid references public.leads(id), project_id uuid references public.projects(id),
 classification text not null check(classification in ('general','design','commercial','operations')),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 archived_at timestamptz, check(num_nonnulls(lead_id,project_id)=1),
 check(lead_id is null or classification='general')
);
create table public.attachment_versions(
 id uuid primary key default gen_random_uuid(),attachment_id uuid not null references public.attachments(id),
 object_path text not null unique,original_name text not null check(length(original_name) between 1 and 255),
 mime_type text not null check(length(mime_type)<=150),expected_size bigint not null check(expected_size between 1 and 104857600),
 actual_size bigint,created_by uuid not null references public.profiles(id),created_at timestamptz not null default now(),ready_at timestamptz,
 check((ready_at is null and actual_size is null) or (ready_at is not null and actual_size=expected_size))
);
create index attachments_lead_idx on public.attachments(lead_id);
create index attachments_project_idx on public.attachments(project_id);
create index attachments_creator_idx on public.attachments(created_by);
create index attachment_versions_history_idx on public.attachment_versions(attachment_id,created_at desc);
create index attachment_versions_creator_idx on public.attachment_versions(created_by);

create function private.attachment_scope(p_lead uuid,p_project uuid,p_class text,p_write boolean) returns boolean
language plpgsql stable security definer set search_path='' as $$
declare r public.app_role;
begin
 r:=private.current_role(); if r is null then return false; end if;
 if p_lead is not null then
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
create function private.can_read_attachment(p_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachments a where a.id=p_id and private.attachment_scope(a.lead_id,a.project_id,a.classification,false))
$$;
create function private.can_upload_attachment_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachment_versions v join public.attachments a on a.id=v.attachment_id
 where v.object_path=p_path and v.created_by=(select auth.uid()) and v.ready_at is null and v.created_at>now()-interval '24 hours'
 and a.archived_at is null and private.attachment_scope(a.lead_id,a.project_id,a.classification,true))
$$;
create function private.can_read_attachment_object(p_path text) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.attachment_versions v join public.attachments a on a.id=v.attachment_id
 where v.object_path=p_path and a.archived_at is null and private.attachment_scope(a.lead_id,a.project_id,a.classification,false)
 and (v.ready_at is not null or (v.created_by=(select auth.uid()) and v.created_at>now()-interval '24 hours')))
$$;
revoke all on function private.attachment_scope(uuid,uuid,text,boolean),private.can_read_attachment(uuid),private.can_upload_attachment_object(text),private.can_read_attachment_object(text) from public,anon;
grant execute on function private.can_read_attachment(uuid),private.can_upload_attachment_object(text),private.can_read_attachment_object(text) to authenticated;
-- Scope helper remains private to privileged implementations; no direct authenticated EXECUTE.
revoke all on function private.attachment_scope(uuid,uuid,text,boolean) from authenticated;
alter table public.attachments enable row level security;
alter table public.attachment_versions enable row level security;
revoke all on public.attachments,public.attachment_versions from anon,authenticated;
grant select on public.attachments,public.attachment_versions to authenticated;
create policy attachment_read on public.attachments for select to authenticated using(private.can_read_attachment(id));
create policy attachment_version_read on public.attachment_versions for select to authenticated using(private.can_read_attachment(attachment_id));
create policy one_odc_object_insert on storage.objects for insert to authenticated with check(bucket_id='one-odc-attachments' and private.can_upload_attachment_object(name));
create policy one_odc_object_read on storage.objects for select to authenticated using(bucket_id='one-odc-attachments' and private.can_read_attachment_object(name));
-- No Storage UPDATE or DELETE policy: no upserts, overwrites or physical deletion.

create function private.reserve_attachment(p_attachment uuid,p_lead uuid,p_project uuid,p_class text,p_name text,p_mime text,p_size bigint)
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
  insert into public.attachments(lead_id,project_id,classification,created_by) values(p_lead,p_project,p_class,auth.uid()) returning * into a;
 else
  select * into a from public.attachments where id=p_attachment for update;
  if not found or a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 end if;
 target:=gen_random_uuid();
 insert into public.attachment_versions(id,attachment_id,object_path,original_name,mime_type,expected_size,created_by)
 values(target,a.id,case when a.project_id is not null then 'projects/'||a.project_id else 'leads/'||a.lead_id end||'/attachments/'||a.id||'/versions/'||target,trim(p_name),p_mime,p_size,auth.uid()) returning * into v;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.upload_reserved',to_jsonb(v));
 return to_jsonb(v)||jsonb_build_object('bucket','one-odc-attachments','max_size',least(cap,104857600));
end $$;
create function private.complete_attachment(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v public.attachment_versions; a public.attachments; actual bigint;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into v from public.attachment_versions where id=p_version for update;
 if not found or v.created_by<>auth.uid() then raise exception 'ACCESS_DENIED'; end if;
 select * into a from public.attachments where id=v.attachment_id for share;
 if a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if v.ready_at is not null then return; end if;
 select (metadata->>'size')::bigint into actual from storage.objects where bucket_id='one-odc-attachments' and name=v.object_path;
 if actual is null or actual<>v.expected_size then raise exception 'STORAGE_OBJECT_NOT_VERIFIED'; end if;
 update public.attachment_versions set ready_at=now(),actual_size=actual where id=v.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.upload_completed',jsonb_build_object('version_id',v.id,'actual_size',actual));
end $$;
create function private.archive_attachment(p_id uuid,p_archive boolean,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.attachments;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into a from public.attachments where id=p_id for update;
 if not found or p_archive is null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if length(trim(coalesce(p_reason,'')))=0 or length(p_reason)>2000 then raise exception 'REASON_REQUIRED'; end if;
 if not p_archive and a.lead_id is not null then
  perform 1 from public.leads where id=a.lead_id for update;
  if a.archived_at is not null and (select count(*) from public.attachments where lead_id=a.lead_id and archived_at is null)>=5 then raise exception 'ATTACHMENT_COUNT_LIMIT'; end if;
 end if;
 update public.attachments set archived_at=case when p_archive then now() else null end where id=a.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,case when p_archive then 'attachment.archived' else 'attachment.restored' end,jsonb_build_object('reason',trim(p_reason)));
end $$;
create function private.record_attachment_download(p_version uuid) returns void
language plpgsql security definer set search_path='' as $$
declare a public.attachments;
begin
 select a0.* into a from public.attachments a0 join public.attachment_versions v on v.attachment_id=a0.id where v.id=p_version and v.ready_at is not null and a0.archived_at is null;
 if not found or not private.can_read_attachment(a.id) then raise exception 'ACCESS_DENIED'; end if;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.download_requested',jsonb_build_object('version_id',p_version));
end $$;
create function public.reserve_attachment(p_attachment uuid,p_lead uuid,p_project uuid,p_class text,p_name text,p_mime text,p_size bigint) returns jsonb language sql security invoker set search_path='' as $$select private.reserve_attachment($1,$2,$3,$4,$5,$6,$7)$$;
create function public.complete_attachment(p_version uuid) returns void language sql security invoker set search_path='' as $$select private.complete_attachment($1)$$;
create function public.archive_attachment(p_id uuid,p_archive boolean,p_reason text) returns void language sql security invoker set search_path='' as $$select private.archive_attachment($1,$2,$3)$$;
create function public.record_attachment_download(p_version uuid) returns void language sql security invoker set search_path='' as $$select private.record_attachment_download($1)$$;
revoke all on function private.reserve_attachment(uuid,uuid,uuid,text,text,text,bigint),private.complete_attachment(uuid),private.archive_attachment(uuid,boolean,text),private.record_attachment_download(uuid),public.reserve_attachment(uuid,uuid,uuid,text,text,text,bigint),public.complete_attachment(uuid),public.archive_attachment(uuid,boolean,text),public.record_attachment_download(uuid) from public,anon;
grant execute on function private.reserve_attachment(uuid,uuid,uuid,text,text,text,bigint),private.complete_attachment(uuid),private.archive_attachment(uuid,boolean,text),private.record_attachment_download(uuid),public.reserve_attachment(uuid,uuid,uuid,text,text,text,bigint),public.complete_attachment(uuid),public.archive_attachment(uuid,boolean,text),public.record_attachment_download(uuid) to authenticated;
commit;
