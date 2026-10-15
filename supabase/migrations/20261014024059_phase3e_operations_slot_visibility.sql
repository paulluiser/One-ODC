-- Capacity is aggregate only; permit authorized post-close Operations uploads without exposing general files.
create or replace function private.get_attachment_slots(p_lead uuid,p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if num_nonnulls(p_lead,p_project)<>1 or not (private.attachment_scope(p_lead,p_project,'general',false) or (p_lead is null and private.attachment_scope(null,p_project,'operations',false))) then raise exception 'ACCESS_DENIED'; end if;
 return private.attachment_slots(p_lead,p_project);
end $$;
