-- Preserve existing primary assignments while releasing Closed project visibility.
CREATE OR REPLACE FUNCTION private.handoff_closed_project(p_project uuid, p_primary_ops uuid, p_reason text, p_confirm boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; primary_designer uuid; supporters uuid[]; ops uuid[]; handoff uuid;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or (private.current_role()<>'system_administrator' and project.lead_designer_id<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if project.commercial_status<>'Closed' or project.is_cancelled then raise exception 'INVALID_HANDOFF_STATE'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 select user_id into primary_designer from public.project_memberships where project_id=p_project and membership_role='designer' and is_primary;
 select coalesce(array_agg(user_id),'{}'::uuid[]) into supporters from public.project_memberships where project_id=p_project and membership_role='designer' and not is_primary;
 select array[p_primary_ops]||coalesce(array_agg(user_id) filter(where user_id<>p_primary_ops),'{}'::uuid[]) into ops from public.project_memberships where project_id=p_project and membership_role='operations_admin';
 if exists(select 1 from public.project_memberships where project_id=p_project and user_id=p_primary_ops and membership_role='operations_admin' and is_primary) then update public.projects set awaiting_handoff=false where id=p_project and awaiting_handoff; return p_primary_ops; end if;
 perform private.set_project_assignments(p_project,primary_designer,supporters,ops,p_reason);
 update public.space_operational_handoffs set invalidated_at=now() where project_id=p_project and invalidated_at is null;
 handoff:=p_primary_ops;
 update public.projects set awaiting_handoff=false where id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'project',p_project,'project.operations_assigned',jsonb_build_object('ops_id',p_primary_ops,'reason',trim(p_reason)));
 return handoff;
end $function$;
-- Avoid duplicate assignment milestones for the same transaction.
create or replace function private.project_milestones(p_project uuid,p_offset integer default 0) returns jsonb language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 perform private.require_role(enum_range(null::public.app_role));
 if not private.can_read_spaces(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if p_offset is null or p_offset not between 0 and 100000 then raise exception 'VALIDATION_ERROR'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)),'[]') into result from (
 select * from (
 select e.id,e.action,e.occurred_at,p.display_name actor,
 case e.action
 when 'lead.reviewed' then 'Lead approved and converted to Project'
 when 'project.assignments_changed' then 'Project team assigned'
 when 'commercial.closed' then 'Project commercially Closed'
 when 'project.operations_assigned' then 'Operations Admin assigned'
 when 'space.created' then 'Space created'
 when 'space.status_changed' then 'Space design status updated'
 when 'space.readiness_changed' then 'Space readiness updated'
 when 'space.readiness_rolled_back' then 'Ordered Space rolled back'
 when 'space.handed_off' then 'Ordered Space handed off'
 when 'space.handoff_acknowledged' then 'Space handoff acknowledged'
 when 'handoff.created' then 'Historical project handoff'
 when 'handoff.acknowledged' then 'Historical handoff acknowledged'
 when 'logistics.saved' then 'Supplier order / delivery updated'
 when 'project.operationally_completed' then 'Project completed'
 when 'project.reopen' then 'Project reopened'
 else e.action end title,
 case when e.entity_type='space' then coalesce(e.new_value->>'name',e.new_value->>'space_name',(select name from public.spaces where id=e.entity_id),'Space')||' · ' else '' end ||
 coalesce(e.new_value->>'readiness_status',e.new_value->>'status',e.new_value->>'reason','') detail
 from public.audit_events e left join public.profiles p on p.id=e.actor_id
 where e.project_id=p_project and not (e.action='project.assignments_changed' and exists(select 1 from public.audit_events related where related.project_id=e.project_id and related.actor_id=e.actor_id and related.occurred_at=e.occurred_at and related.action='project.operations_assigned')) and (
 e.action in ('lead.reviewed','project.assignments_changed','commercial.closed','project.operations_assigned','space.created','space.readiness_changed','space.readiness_rolled_back','space.handed_off','space.handoff_acknowledged','handoff.created','handoff.acknowledged','project.operationally_completed','project.reopen')
 or (e.action='space.status_changed' and e.new_value->>'status' in ('Submitted','Completed','For Revision'))
 or (e.action='logistics.saved' and e.new_value->>'status' in ('RFP','For Manufacturing','For Delivery','Delivered') and e.previous_value->>'status' is distinct from e.new_value->>'status'))
 union all select s.id,'lead.endorsed',s.submitted_at,p.display_name,'Lead endorsed for review','Submission '||s.number from public.lead_submissions s join public.project_origins o on o.lead_id=s.lead_id left join public.profiles p on p.id=s.submitted_by where o.project_id=p_project and private.current_role()<>'operations_admin'
 ) milestones order by occurred_at desc,id desc limit 20 offset p_offset
 ) x;
 return result;
end $$;
