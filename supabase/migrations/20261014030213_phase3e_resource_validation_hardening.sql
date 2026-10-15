create or replace function private.valid_resource_links(links jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare item jsonb; seen uuid[]:='{}'; identity uuid;
begin
 if links is null or jsonb_typeof(links)<>'array' or jsonb_array_length(links)>20 then return false; end if;
 for item in select value from jsonb_array_elements(links) loop
  if jsonb_typeof(item)<>'object' or coalesce(jsonb_typeof(item->'url'),'')<>'string' or length(item->>'url')>2048 or (item->>'url') !~ '^https://[A-Za-z0-9]([A-Za-z0-9.-]*[A-Za-z0-9])?([:][0-9]{1,5})?([/?#][^[:space:]\\]*)?$' then return false; end if;
  if coalesce(substring(item->>'url' from '^https://[^/:?#]+:([0-9]+)')::integer,0)>65535 then return false; end if;
  identity:=(item->>'id')::uuid;
  if identity is null or identity=any(seen) then return false; end if;
  seen:=array_append(seen,identity);
 end loop;
 return true;
exception when others then return false;
end $$;
create or replace function private.update_project_resources(p_project uuid,p_version integer,p_notes text,p_links jsonb,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare l public.leads; previous jsonb;
begin
 perform private.require_role(array['bdm','lead_designer','system_administrator']::public.app_role[]);
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
