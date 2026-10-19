-- Administrators create on behalf of an active BDM; commercial ownership stays with that BDM.
-- Keep all existing validation, routing, optimistic versions and audit behavior.
do $migration$
declare definition text;
begin
 definition := pg_get_functiondef('private.save_lead(uuid,integer,jsonb,boolean,text)'::regprocedure);
 if position('perform private.require_role(array[''bdm'']::public.app_role[]);' in definition)=0
 or position('insert into public.leads(id,bdm_id) values(p_id,auth.uid())' in definition)=0
 or position('if l.bdm_id<>auth.uid() then raise exception ''ACCESS_DENIED''; end if;' in definition)=0 then
   raise exception 'Unexpected save_lead definition; refusing permission patch';
 end if;
 definition:=replace(definition,'recipient uuid;','recipient uuid; owner_id uuid;');
 definition:=replace(definition,'perform private.require_role(array[''bdm'']::public.app_role[]);', $patch$
 perform private.require_role(array['bdm','system_administrator']::public.app_role[]);
 if private.current_role()='system_administrator' then
   select bdm_id into owner_id from public.leads where id=p_id;
   if owner_id is null then
     owner_id:=nullif(p_payload->>'bdm_id','')::uuid;
   elsif nullif(p_payload->>'bdm_id','')::uuid is not null and nullif(p_payload->>'bdm_id','')::uuid<>owner_id then
     raise exception 'ACCESS_DENIED';
   end if;
   perform 1 from public.profiles where id=owner_id and active and role='bdm' for share;
   if not found then raise exception 'INVALID_BDM'; end if;
 else
   owner_id:=auth.uid();
   if nullif(p_payload->>'bdm_id','')::uuid is not null and nullif(p_payload->>'bdm_id','')::uuid<>owner_id then raise exception 'ACCESS_DENIED'; end if;
 end if;
 $patch$);
 definition:=replace(definition,'insert into public.leads(id,bdm_id) values(p_id,auth.uid())','insert into public.leads(id,bdm_id) values(p_id,owner_id)');
 definition:=replace(definition,'if l.bdm_id<>auth.uid() then raise exception ''ACCESS_DENIED''; end if;', $patch$
 if l.bdm_id<>auth.uid() and not (
   private.current_role()='system_administrator' and (
     l.version=0 or exists(select 1 from public.audit_events e where e.entity_type='lead' and e.entity_id=l.id and e.actor_id=auth.uid() and e.action in ('lead.draft_saved','lead.submitted') and e.new_value->>'version'='1')
   )
 ) then raise exception 'ACCESS_DENIED'; end if;
 $patch$);
 execute definition;
 definition:=pg_get_functiondef('private.find_duplicate_leads(text,text,uuid)'::regprocedure);
 if position('perform private.require_role(array[''bdm'']::public.app_role[]);' in definition)=0 then raise exception 'Unexpected duplicate-check definition'; end if;
 definition:=replace(definition,'perform private.require_role(array[''bdm'']::public.app_role[]);','perform private.require_role(array[''bdm'',''system_administrator'']::public.app_role[]);');
 definition:=replace(definition,'l.bdm_id=auth.uid()','(l.bdm_id=auth.uid() or private.current_role()=''system_administrator'')');
 execute definition;
end;
$migration$;

-- Preserve private BDM drafts; an administrator may additionally read only drafts they authored.
create or replace function private.can_read_lead(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.leads l where l.id=target and (
  (private.current_role()='bdm' and l.bdm_id=auth.uid()) or
  (private.current_role()='system_administrator' and (
    l.status<>'Draft' or l.first_submitted_at is not null or exists(
      select 1 from public.audit_events e where e.entity_type='lead' and e.entity_id=l.id and e.actor_id=auth.uid()
      and e.action in ('lead.draft_saved','lead.submitted') and e.new_value->>'version'='1'
    )
  )) or
  (private.current_role()='lead_designer' and (l.status<>'Draft' or l.first_submitted_at is not null)
   and coalesce((select p.lead_designer_id from public.project_origins o join public.projects p on p.id=o.project_id where o.lead_id=l.id),l.assigned_lead_designer_id)=auth.uid())
 ));
$$;
