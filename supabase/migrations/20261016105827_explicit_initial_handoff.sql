-- Editing team assignments does not implicitly release an awaiting project.
-- Subsequent primary Ops reassignments still require a fresh acknowledgment.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.assign_project_personnel(uuid,uuid,uuid[],uuid[],text)'::regprocedure);
 definition:=replace(definition,'if closure is not null then perform private.create_handoff(p_project,closure,p_ops[1],trim(p_reason)); update public.projects set awaiting_handoff=false where id=p_project; end if;',
 'if closure is not null and exists(select 1 from public.project_handoffs where project_id=p_project) then perform private.create_handoff(p_project,closure,p_ops[1],trim(p_reason)); end if;');
 execute definition;
 definition:=pg_get_functiondef('private.handoff_closed_project(uuid,uuid,text,boolean)'::regprocedure);
 definition:=replace(definition,'perform private.assign_project_personnel(p_project,primary_designer,supporters,ops,p_reason);',
 'perform private.assign_project_personnel(p_project,primary_designer,supporters,ops,p_reason); perform private.create_handoff(p_project,(select id from public.commercial_closures where project_id=p_project),p_primary_ops,trim(p_reason));');
 execute definition;
end $$;
