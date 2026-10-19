-- Duplicate hints must follow the same visibility rules as the lead directory.
create or replace function private.find_duplicate_leads(p_name text,p_address text,p_exclude uuid default null)
returns table(id uuid,reference text,project_name text,status public.lead_status)
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['bdm','system_administrator']::public.app_role[]);
 return query select l.id,l.reference,l.project_name,l.status from public.leads l
 where private.can_read_lead(l.id) and l.id is distinct from p_exclude and l.status<>'Rejected'
 and ((length(trim(p_name))>0 and lower(trim(l.project_name))=lower(trim(p_name)))
 or (length(trim(p_address))>0 and lower(trim(l.address))=lower(trim(p_address))))
 order by l.created_at desc limit 10;
end; $$;
