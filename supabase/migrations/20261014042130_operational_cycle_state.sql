create or replace function private.sync_completed_project() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.projects p set is_operationally_completed=not exists(select 1 from public.project_operational_cycles c where c.project_id=new.project_id and c.ended_at is null) and coalesce((select c.outcome='Completed' from public.project_operational_cycles c where c.project_id=new.project_id order by number desc limit 1),false) where p.id=new.project_id;
 return new;
end $$;
update public.projects p set is_operationally_completed=not exists(select 1 from public.project_operational_cycles c where c.project_id=p.id and c.ended_at is null) and coalesce((select c.outcome='Completed' from public.project_operational_cycles c where c.project_id=p.id order by number desc limit 1),false);
create or replace function private.operational_readiness(p_project uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects; monitoring public.project_monitoring; blockers jsonb:='[]'; cycle integer;
begin
 if not private.can_read_pipeline(p_project) or (private.current_role()='operations_admin' and not private.logistics_reader(p_project)) then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project;
 select * into monitoring from public.project_monitoring where project_id=p_project;
 select number into cycle from public.project_operational_cycles where project_id=p_project and ended_at is null;
 if project.commercial_status<>'Closed' then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','commercial','label','Commercial Sale must be closed')); end if;
 if not exists(select 1 from public.project_handoffs where project_id=p_project and superseded_at is null and status='Acknowledged') then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','handoff','label','Current operational handoff must be acknowledged')); end if;
 if monitoring.state<>'Active' or project.is_cancelled then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','lifecycle','label','Project must be Active, not On Hold or Cancelled')); end if;
 if cycle is null then blockers:=blockers||jsonb_build_array(jsonb_build_object('kind','cycle','label','No open operational cycle; completed Projects must be reopened first')); end if;
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','design','id',s.id,'label',s.name||': design '||s.status)) from public.spaces s where s.project_id=p_project and s.cancelled_at is null and s.status<>'Completed'),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','installation','id',s.id,'label',s.name||': installation '||coalesce(i.status,'Not Scheduled'))) from public.spaces s left join public.space_installations i on i.space_id=s.id where s.project_id=p_project and s.cancelled_at is null and coalesce(i.status,'Not Scheduled') not in ('Completed','Not Applicable')),'[]');
 blockers:=blockers||coalesce((select jsonb_agg(jsonb_build_object('kind','logistics','id',l.id,'label',l.supplier_name||': logistics '||l.status)) from public.project_logistics l where l.project_id=p_project and l.status not in ('Delivered','Cancelled')),'[]');
 return jsonb_build_object('project_id',p_project,'version',monitoring.version,'cycle',cycle,'ready',jsonb_array_length(blockers)=0,'blockers',blockers,'can_complete',private.space_manager(p_project),'completed',cycle is null and coalesce((select outcome='Completed' from public.project_operational_cycles where project_id=p_project order by number desc limit 1),false),'history',coalesce((select jsonb_agg(jsonb_build_object('cycle',c.cycle_number,'completed_at',c.completed_at,'completed_by',c.completed_by,'reason',c.reason,'administrative_override',c.administrative_override) order by c.cycle_number) from public.operational_completions c where c.project_id=p_project),'[]'));
end $$;
