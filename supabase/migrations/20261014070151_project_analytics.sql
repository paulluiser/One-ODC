-- Shared by the existing dashboard and analytics. Internal only: callers must scope Projects first.
create function private.dashboard_project_risk(p_project uuid) returns text language sql stable security invoker set search_path='' as $$
 with p as (select p.*,m.deadline,coalesce(m.timezone,'Asia/Manila') timezone,(now() at time zone coalesce(m.timezone,'Asia/Manila'))::date today from public.projects p left join public.project_monitoring m on m.project_id=p.id where p.id=p_project),
 spaces as (select s.*,p.today,p.timezone,greatest(s.last_progress_at,(select max(a.activity_date::timestamp at time zone p.timezone) from public.project_activities a where a.space_id=s.id and a.category in ('Design Work','Revision','Site Visit'))) progress_at from public.spaces s,p where s.project_id=p.id and s.cancelled_at is null)
 select case when p.deadline<p.today or exists(select 1 from spaces s where s.status<>'Completed' and s.deadline<p.today) then 'Overdue'
 when private.dashboard_risk(p.deadline,(greatest(p.created_at,(select max(s.last_progress_at) from spaces s),(select max(a.activity_date::timestamp at time zone p.timezone) from public.project_activities a where a.project_id=p.id and a.category in ('Design Work','Revision','Site Visit','Supplier Update','Installation'))) at time zone p.timezone)::date,p.today)='At Risk'
 or exists(select 1 from spaces s where s.status<>'Completed' and private.dashboard_risk(s.deadline,(s.progress_at at time zone s.timezone)::date,s.today)='At Risk') then 'At Risk' else 'On Track' end from p
$$;
revoke all on function private.dashboard_project_risk(uuid) from public,anon,authenticated;

-- Add immutable monitoring context to new completions; preserve all old snapshots.
create or replace function private.complete_operations(p_project uuid,p_version integer,p_cycle integer,p_confirm boolean,p_reason text) returns void language plpgsql security definer set search_path='' as $$
declare readiness jsonb; reason text:=trim(coalesce(p_reason,'')); snapshot jsonb;
begin
 perform private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.space_manager(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 readiness:=private.operational_readiness(p_project);
 if (readiness->>'cycle') is null then raise exception 'PROJECT_ALREADY_COMPLETED'; end if;
 if (readiness->>'version')::integer is distinct from p_version or (readiness->>'cycle')::integer is distinct from p_cycle then raise exception 'VERSION_CONFLICT'; end if;
 if not (readiness->>'ready')::boolean then raise exception 'OPERATIONAL_PREREQUISITES'; end if;
 if length(reason) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 snapshot:=jsonb_build_object('monitoring',(select jsonb_build_object('deadline',deadline,'timezone',timezone) from public.project_monitoring where project_id=p_project),'spaces',coalesce((select jsonb_agg(to_jsonb(s)||jsonb_build_object('installation',to_jsonb(i))) from public.spaces s left join public.space_installations i on i.space_id=s.id where s.project_id=p_project and s.cancelled_at is null),'[]'),'logistics',coalesce((select jsonb_agg(to_jsonb(l)) from public.project_logistics l where l.project_id=p_project),'[]'),'handoff',(select to_jsonb(h) from public.project_handoffs h where h.project_id=p_project and superseded_at is null));
 insert into public.operational_completions(project_id,cycle_number,completed_by,reason,administrative_override,snapshot) values(p_project,p_cycle,auth.uid(),reason,private.current_role()='system_administrator',snapshot);
 update public.project_operational_cycles set ended_at=now(),outcome='Completed' where project_id=p_project and number=p_cycle and ended_at is null;
 update public.project_monitoring set version=version+1 where project_id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'project',p_project,'project.operationally_completed',jsonb_build_object('cycle',p_cycle,'reason',reason,'administrative_override',private.current_role()='system_administrator'));
 insert into public.notifications(recipient_id,project_id,message) select distinct user_id,p_project,'Project operational cycle '||p_cycle||' completed.' from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project and p.active;
end $$;

-- Historical Space assignments cannot contribute current workload after Project access is removed.
create or replace function private.role_dashboard(p_view text default '',p_page integer default 1) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); viewer_role public.app_role:=private.current_role(); result jsonb;
begin
 if actor is null or viewer_role is null then raise exception 'ACCESS_DENIED'; end if;
 if p_page is null or p_page not between 1 and 100000 or p_view is null or length(p_view)>80 then raise exception 'VALIDATION_ERROR'; end if;
 with
 ctx as (select (now() at time zone 'Asia/Manila')::date today),
 projects as materialized (
  select p.*,m.timezone,m.deadline,m.state,
   (now() at time zone coalesce(m.timezone,'Asia/Manila'))::date today,
   exists(select 1 from public.project_operational_cycles c where c.project_id=p.id and c.ended_at is null) open_cycle
  from public.projects p left join public.project_monitoring m on m.project_id=p.id
  where private.can_read_pipeline(p.id)
 ),
 active as materialized (select * from projects where not is_cancelled and not is_operationally_completed and open_cycle),
 design_spaces as materialized (
  select s.*,p.name project_name,p.timezone,p.today,p.commercial_status,p.created_at project_created_at,
   greatest(s.last_progress_at,(select max(a.activity_date::timestamp at time zone p.timezone) from public.project_activities a where a.space_id=s.id and a.category in ('Design Work','Revision','Site Visit'))) progress_at
  from public.spaces s join active p on p.id=s.project_id
  where viewer_role in ('lead_designer','designer') and s.cancelled_at is null
 ),
 personal as materialized (select * from design_spaces s where viewer_role='designer' and (s.primary_designer_id=actor or exists(select 1 from public.space_supporters ss where ss.space_id=s.id and ss.user_id=actor))),
 project_risk as materialized (select p.id,p.name,p.created_at,private.dashboard_project_risk(p.id) risk from active p where viewer_role='lead_designer'),
 ops as materialized (select * from active where viewer_role='operations_admin' and commercial_status='Closed'),
 ops_records as materialized (select l.*,p.today,p.timezone,p.name project_name from public.project_logistics l join ops p on p.id=l.project_id),
 source as (
  -- Account KPIs contain profile IDs/names only. No Auth metadata is returned.
  select case when p.active then 'active_users' else 'inactive_users' end key,p.id,p.display_name label,'/dashboard/users' href,p.role::text detail,null::numeric amount,p.created_at at
   from public.profiles p where viewer_role='system_administrator'
  union all select 'invitations',p.id,p.display_name,'/dashboard/users','Invited; no recorded sign-in',null,p.created_at from public.profiles p join auth.users u on u.id=p.id where viewer_role='system_administrator' and u.invited_at is not null and u.last_sign_in_at is null
  union all select 'access_alerts',p.id,p.display_name,'/dashboard/users','Inactive access',null,p.created_at from public.profiles p where viewer_role='system_administrator' and not p.active
  union all select 'system_activity',a.id,a.action,'/dashboard/users','Recorded system event (values omitted)',null,a.occurred_at from public.audit_events a,ctx where viewer_role='system_administrator' and (a.occurred_at at time zone 'Asia/Manila')::date between ctx.today-13 and ctx.today
  -- Lead Designer: current scoped workload and historical completion dates.
  union all select 'active_projects',p.id,p.name,'/dashboard/projects/'||p.id,'Active operational cycle · '||coalesce(p.state,'Active'),null,p.created_at from active p where viewer_role='lead_designer'
  union all select case when r.risk='Overdue' then 'overdue_projects' else 'risk_projects' end,r.id,r.name,'/dashboard/projects/'||r.id,r.risk,null,r.created_at from project_risk r where r.risk in ('Overdue','At Risk')
  union all select 'attention_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text||coalesce(' · Due '||s.deadline::text,''),null,s.updated_at from design_spaces s where viewer_role='lead_designer' and s.status<>'Completed' and (s.status in ('Submitted','For Revision','On Hold') or private.dashboard_risk(s.deadline,(s.progress_at at time zone s.timezone)::date,s.today)<>'On Track')
  union all select 'quotation_reviews',v.id,p.name||' · Quotation '||v.number,'/dashboard/projects/'||p.id||'?tab=quotation&version='||v.id,'Submitted for Review',null,v.submitted_at from public.quotation_versions v join projects p on p.id=v.project_id where viewer_role='lead_designer' and not p.is_cancelled and v.state='Submitted for Review'
  union all select 'recent_completed',p.id,p.name,'/dashboard/projects/'||p.id,'Last operational completion · '||c.completed_at::text||' · Current: '||case when p.is_cancelled then 'Cancelled' when p.is_operationally_completed then 'Completed' else coalesce(p.state,'Active') end,null,c.completed_at from projects p join lateral(select * from public.operational_completions c where c.project_id=p.id order by cycle_number desc limit 1)c on true where viewer_role='lead_designer' and (c.completed_at at time zone p.timezone)::date between p.today-13 and p.today
  -- Designer metrics use EXISTS, never supporter joins which duplicate Spaces.
  union all select 'assigned_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text,null,s.updated_at from personal s where s.status<>'Completed'
  union all select 'due_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,'Due '||s.deadline::text,null,s.updated_at from personal s where s.status<>'Completed' and s.deadline between s.today and s.today+3
  union all select 'overdue_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,'Overdue · Due '||s.deadline::text,null,s.updated_at from personal s where s.status<>'Completed' and s.deadline<s.today
  union all select 'revision_spaces',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,'For Revision',null,s.updated_at from personal s where s.status='For Revision'
  union all select 'design_tasks',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text,null,s.updated_at from personal s where s.status<>'Completed'
  union all select 'installation_tasks',s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'?tab=installation#installation-'||s.id,coalesce(i.status,'Not Scheduled')||coalesce(' · Scheduled '||i.scheduled_date::text,''),null,coalesce(i.updated_at,s.updated_at) from personal s left join public.space_installations i on i.space_id=s.id where s.commercial_status='Closed' and coalesce(i.status,'Not Scheduled') not in ('Completed','Not Applicable')
  -- BDM: own Leads and related Projects, Sale-only aggregate.
  union all select 'submitted_leads',l.id,l.project_name,'/dashboard/leads/'||l.id,l.status::text,null,l.updated_at from public.leads l where viewer_role='bdm' and l.bdm_id=actor and l.first_submitted_at is not null
  union all select case l.status when 'Submitted' then 'awaiting_leads' when 'Returned for Clarification' then 'clarification_leads' when 'Accepted' then 'accepted_leads' else 'rejected_leads' end,l.id,l.project_name,'/dashboard/leads/'||l.id,l.status::text,null,l.updated_at from public.leads l where viewer_role='bdm' and l.bdm_id=actor and l.status in ('Submitted','Returned for Clarification','Accepted','Rejected')
  union all select 'commercial_opportunities',p.id,p.name,'/dashboard/projects/'||p.id,p.commercial_status::text,null,p.created_at from active p where viewer_role='bdm' and p.commercial_status<>'Closed'
  union all select 'closed_projects',p.id,p.name,'/dashboard/projects/'||p.id,'Closed',null,p.created_at from projects p where viewer_role='bdm' and not p.is_cancelled and p.commercial_status='Closed'
  union all select 'sale',p.id,p.name,'/dashboard/projects/'||p.id||'?tab=finance','Authorized Sale · PHP '||v.amount::text,v.amount,p.created_at from projects p join public.project_financial_values v on v.project_id=p.id and v.kind='Sale' where viewer_role='bdm' and not p.is_cancelled
  -- Operations: no pre-close metadata, quotation, Sale or derived finances.
  union all select 'handoffs',h.id,p.name,'/dashboard/projects/'||p.id,'Pending primary acknowledgment',null,h.assigned_at from public.project_handoffs h join ops p on p.id=h.project_id where h.superseded_at is null and h.status='Pending Acknowledgment' and h.primary_ops_id=actor
  union all select 'operational_projects',p.id,p.name,'/dashboard/projects/'||p.id,'Closed · Active operational cycle',null,p.created_at from ops p
  union all select 'logistics:'||l.status,l.id,l.supplier_name||' · '||l.project_name,'/dashboard/projects/'||l.project_id||'?tab=logistics#logistics-'||l.id,l.status,null,l.status_at from ops_records l where l.status<>'Cancelled'
  union all select 'delayed_logistics',l.id,l.supplier_name||' · '||l.project_name,'/dashboard/projects/'||l.project_id||'?tab=logistics#logistics-'||l.id,'No stage change for '||(l.today-(l.status_at at time zone l.timezone)::date)||' calendar days · '||l.status,null,l.status_at from ops_records l where l.status not in ('Delivered','Cancelled') and (l.status_at at time zone l.timezone)::date<=l.today-7
  union all select 'ops_installations',s.id,s.name||' · '||p.name,'/dashboard/projects/'||p.id||'?tab=installation#installation-'||s.id,coalesce(i.status,'Not Scheduled')||coalesce(' · Scheduled '||i.scheduled_date::text,''),null,coalesce(i.updated_at,s.updated_at) from public.spaces s join ops p on p.id=s.project_id left join public.space_installations i on i.space_id=s.id where s.cancelled_at is null and coalesce(i.status,'Not Scheduled') not in ('Completed','Not Applicable')
  union all select 'recent_delivered',p.id,p.name,'/dashboard/projects/'||p.id||'?tab=logistics','All non-cancelled logistics Delivered',null,(select max(l.status_at) from public.project_logistics l where l.project_id=p.id and l.status='Delivered') from projects p where viewer_role='operations_admin' and p.commercial_status='Closed' and not p.is_cancelled and exists(select 1 from public.project_logistics l where l.project_id=p.id and l.status='Delivered' and (l.status_at at time zone p.timezone)::date between p.today-13 and p.today) and not exists(select 1 from public.project_logistics l where l.project_id=p.id and l.status not in ('Delivered','Cancelled'))
 ),
 totals as (select key,count(*) count,case when key='sale' then sum(amount)::text end amount from source group by key),
 selected as (select id,label,href,detail,at from source where key=p_view order by at desc,id limit 25 offset (p_page-1)*25),
 action_rows as (select distinct on (id) id,label,href,detail,at from source where key in ('access_alerts','invitations','quotation_reviews','attention_spaces','overdue_spaces','due_spaces','design_tasks','revision_spaces','clarification_leads','awaiting_leads','handoffs','delayed_logistics','ops_installations','installation_tasks') order by id,at desc),
 workload as (
  select person.id,person.display_name,count(distinct s.id) count from design_spaces s
  join public.profiles person on person.active and person.role='designer' and exists(select 1 from public.project_memberships pm where pm.project_id=s.project_id and pm.user_id=person.id and pm.membership_role='designer') and (person.id=s.primary_designer_id or exists(select 1 from public.space_supporters ss where ss.space_id=s.id and ss.user_id=person.id))
  where viewer_role='lead_designer' and s.status<>'Completed' group by person.id,person.display_name
 ),
 workload_page as(select * from workload order by count desc,id limit 25 offset (case when p_view='workload' then (p_page-1)*25 else 0 end)),
 recent as (
  select n.id,n.message label,case when n.project_id is not null and private.can_read_pipeline(n.project_id) then '/dashboard/projects/'||n.project_id else '/dashboard/notifications' end href,n.created_at at from public.notifications n where viewer_role<>'system_administrator' and n.recipient_id=actor
  union all select a.id,a.action,'/dashboard/users',a.occurred_at from public.audit_events a where viewer_role='system_administrator'
 )
 select jsonb_build_object('role',viewer_role,'as_of',now(),'timezone','Asia/Manila','metrics',coalesce((select jsonb_object_agg(key,jsonb_build_object('count',count,'amount',amount)) from totals),'{}'),
  'view',p_view,'page',p_page,'records',coalesce((select jsonb_agg(to_jsonb(s)) from selected s),'[]'),
  'actions',coalesce((select jsonb_agg(to_jsonb(a)) from (select * from action_rows order by at desc,id limit 8)a),'[]'),
  'recent',coalesce((select jsonb_agg(to_jsonb(r)) from (select * from recent order by at desc,id limit 8)r),'[]'),
  'workload',coalesce((select jsonb_agg(to_jsonb(w)) from workload_page w),'[]'),
  'workload_count',(select count(*) from workload),
  'unread',(select count(*) from public.notifications n where n.recipient_id=actor and n.read_at is null)) into result;
 if p_view<>'' and p_view<>'workload' and not exists(select 1 from jsonb_object_keys(result->'metrics') k where k=p_view) then
  -- Empty authorized metrics are valid; unknown/foreign metrics cannot leak records.
  result:=jsonb_set(result,'{records}','[]');
 end if;
 return result;
end $$;

-- Read-only analytics: scoped before aggregation; no business mutation or financial permissions change.
create function private.project_analytics(p_from date,p_to date,p_stage text default '',p_brand text default '',p_stakeholder uuid default null,p_view text default '',p_bucket text default '',p_page integer default 1)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare actor uuid:=auth.uid(); viewer public.app_role:=private.current_role(); result jsonb;
begin
 if actor is null or viewer is null then raise exception 'ACCESS_DENIED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>1095 or p_to>(now() at time zone 'Asia/Manila')::date
 or p_stage is null or p_stage not in ('','For Quotation','Negotiation','Closed','Completed','Cancelled','On Hold')
 or p_brand is null or p_brand not in ('','SFY','Stosa','Both') or (viewer='operations_admin' and p_brand<>'')
 or p_view is null or length(p_view)>60 or p_bucket is null or length(p_bucket)>100 or p_page is null or p_page not between 1 and 100000 then raise exception 'VALIDATION_ERROR'; end if;
 with
 authorized as materialized (
  select p.*,coalesce(m.timezone,'Asia/Manila') timezone,m.deadline,m.original_deadline,coalesce(m.state,'Active') state,
   (now() at time zone coalesce(m.timezone,'Asia/Manila'))::date today,
   exists(select 1 from public.project_operational_cycles c where c.project_id=p.id and c.ended_at is null) open_cycle,
   case when p.is_cancelled then 'Cancelled' when p.is_operationally_completed then 'Completed' when m.state='On Hold' then 'On Hold' else p.commercial_status::text end stage
  from public.projects p left join public.project_monitoring m on m.project_id=p.id
  where private.can_read_pipeline(p.id) and (viewer<>'operations_admin' or p.commercial_status='Closed')
 ),
 scoped as materialized (
  select p.* from authorized p where (p_stage='' or p.stage=p_stage)
   and (p_brand='' or exists(select 1 from public.project_origins o join public.leads l on l.id=o.lead_id where o.project_id=p.id and l.brand::text=p_brand))
   and (p_stakeholder is null or exists(select 1 from public.project_memberships pm where pm.project_id=p.id and pm.user_id=p_stakeholder) or p.lead_designer_id=p_stakeholder)
 ),
 cohort as materialized (select * from scoped where (created_at at time zone timezone)::date between p_from and p_to),
 active as materialized (select * from cohort where not is_cancelled and not is_operationally_completed and open_cycle),
 spaces as materialized (
  select s.*,p.name project_name,p.timezone,p.today,p.commercial_status,
   greatest(s.last_progress_at,(select max(a.activity_date::timestamp at time zone p.timezone) from public.project_activities a where a.space_id=s.id and a.category in ('Design Work','Revision','Site Visit'))) progress_at
  from public.spaces s join cohort p on p.id=s.project_id where s.cancelled_at is null
 ),
 risk as materialized (select p.id,p.name,p.created_at,private.dashboard_project_risk(p.id) risk from active p where viewer in ('lead_designer','system_administrator')),
 completion_history as materialized (
  -- Latest recorded completion per Project, selected BEFORE the date filter: reopening never duplicates a Project.
  select p.*,c.completed_at,c.cycle_number,
   coalesce(c.snapshot->'monitoring'->>'timezone',d.new_value->>'timezone',future.previous_value->>'timezone','Asia/Manila') completion_timezone,
   case when c.snapshot ? 'monitoring' then (c.snapshot->'monitoring'->>'deadline')::date when d.id is not null then (d.new_value->>'deadline')::date when future.id is not null then (future.previous_value->>'deadline')::date else p.original_deadline end completion_deadline,
   (select sum(greatest(0,(cy.ended_at at time zone coalesce(c.snapshot->'monitoring'->>'timezone',d.new_value->>'timezone',future.previous_value->>'timezone','Asia/Manila'))::date-(cy.started_at at time zone coalesce(c.snapshot->'monitoring'->>'timezone',d.new_value->>'timezone',future.previous_value->>'timezone','Asia/Manila'))::date)) from public.project_operational_cycles cy where cy.project_id=p.id and cy.number<=c.cycle_number and cy.ended_at is not null) duration
  from scoped p join lateral(select * from public.operational_completions c where c.project_id=p.id order by cycle_number desc limit 1)c on true
  left join lateral(select a.id,a.new_value from public.audit_events a where a.project_id=p.id and a.action='project.deadline_revised' and a.occurred_at<=c.completed_at order by a.occurred_at desc,(a.new_value->>'version')::integer desc limit 1)d on true
  left join lateral(select a.id,a.previous_value from public.audit_events a where a.project_id=p.id and a.action='project.deadline_revised' and a.occurred_at>c.completed_at order by a.occurred_at,(a.new_value->>'version')::integer limit 1)future on true
 ),
 completed as materialized (select * from completion_history where (completed_at at time zone completion_timezone)::date between p_from and p_to),
 commercial_leads as materialized (
  -- Lead Designer's pre-conversion review queue is global; accepted Leads follow authorized Projects.
  select l.* from public.leads l where viewer in ('bdm','lead_designer','system_administrator') and l.first_submitted_at is not null
   and (viewer='system_administrator' or (viewer='bdm' and l.bdm_id=actor) or (viewer='lead_designer' and (not exists(select 1 from public.project_origins o where o.lead_id=l.id) or exists(select 1 from public.project_origins o join authorized p on p.id=o.project_id where o.lead_id=l.id))))
   and (l.first_submitted_at at time zone 'Asia/Manila')::date between p_from and p_to
   and (p_brand='' or l.brand::text=p_brand)
   and (p_stakeholder is null or l.bdm_id=p_stakeholder or exists(select 1 from public.project_origins o join scoped p on p.id=o.project_id where o.lead_id=l.id))
   and (p_stage='' or exists(select 1 from public.project_origins o join scoped p on p.id=o.project_id where o.lead_id=l.id))
 ),
 ops_projects as materialized(select * from cohort where commercial_status='Closed' and not is_cancelled and not is_operationally_completed and open_cycle and viewer in ('lead_designer','operations_admin','system_administrator')),
 source as materialized (
  select 'projects'::text key,p.stage::text bucket,p.id,p.name label,'/dashboard/projects/'||p.id href,p.stage detail,null::numeric value,p.created_at at from cohort p
  union all select 'active_projects','',p.id,p.name,'/dashboard/projects/'||p.id,'Active operational cycle',null,p.created_at from active p
  union all select 'completed_projects','',p.id,p.name,'/dashboard/projects/'||p.id,'Currently operationally completed',null,p.created_at from cohort p where is_operationally_completed and not is_cancelled
  union all select 'completions',to_char(c.completed_at at time zone c.completion_timezone,'YYYY-MM'),c.id,c.name,'/dashboard/projects/'||c.id,'Last completion; current: '||c.stage,c.duration,c.completed_at from completed c
  union all select 'completion_timing',case when c.completion_deadline is null then 'Unavailable deadline' when (c.completed_at at time zone c.completion_timezone)::date<=c.completion_deadline then 'On time' else 'Overdue' end,c.id,c.name,'/dashboard/projects/'||c.id,coalesce('Deadline at completion: '||c.completion_deadline::text,'No recorded deadline at completion'),null,c.completed_at from completed c
  union all select 'risk',r.risk,r.id,r.name,'/dashboard/projects/'||r.id,r.risk,null,r.created_at from risk r
  union all select 'spaces',s.status::text,s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,s.status::text,null,s.updated_at from spaces s where viewer<>'operations_admin'
  union all select 'leads','Submitted',l.id,l.project_name,'/dashboard/leads/'||l.id,l.status::text,null,l.first_submitted_at from commercial_leads l
  union all select 'accepted_leads','Accepted',l.id,l.project_name,'/dashboard/leads/'||l.id,'Accepted from submitted cohort',null,l.resolved_at from commercial_leads l where l.status='Accepted'
  union all select 'closed',to_char(c.closed_at at time zone p.timezone,'YYYY-MM'),p.id,p.name,'/dashboard/projects/'||p.id,'Commercial closure',null,c.closed_at from scoped p join public.commercial_closures c on c.project_id=p.id where viewer in ('bdm','lead_designer','system_administrator') and not p.is_cancelled and (c.closed_at at time zone p.timezone)::date between p_from and p_to
  union all select 'sale','',p.id,p.name,'/dashboard/projects/'||p.id||'?tab=finance','Current Sale in project-created cohort',v.amount,v.updated_at from cohort p join public.project_financial_values v on v.project_id=p.id and v.kind='Sale' where viewer in ('bdm','lead_designer','system_administrator') and not p.is_cancelled and private.finance_reader(p.id,'Sale')
  union all select 'collections','',p.id,p.name,'/dashboard/projects/'||p.id||'?tab=finance','All recorded, non-voided client payments in Sale cohort',coalesce((select sum(pay.amount) from public.project_payments pay where pay.project_id=p.id and pay.kind='client' and not pay.voided),0),p.created_at from cohort p join public.project_financial_values v on v.project_id=p.id and v.kind='Sale' where viewer in ('bdm','lead_designer','system_administrator') and not p.is_cancelled and private.finance_reader(p.id,'Sale')
  union all select 'handoffs',case when p.today-(c.closed_at at time zone p.timezone)::date<7 then '0–6 days' when p.today-(c.closed_at at time zone p.timezone)::date<14 then '7–13 days' else '14+ days' end,h.id,p.name,'/dashboard/projects/'||p.id,'Since original closure: '||(p.today-(c.closed_at at time zone p.timezone)::date)||' calendar days',null,h.assigned_at from ops_projects p join public.project_handoffs h on h.project_id=p.id and h.superseded_at is null join public.commercial_closures c on c.project_id=p.id where h.status='Pending Acknowledgment' and (viewer<>'operations_admin' or h.primary_ops_id=actor)
  union all select 'logistics',l.status,l.id,l.supplier_name||' · '||p.name,'/dashboard/projects/'||p.id||'?tab=logistics#logistics-'||l.id,l.status,null,l.status_at from ops_projects p join public.project_logistics l on l.project_id=p.id where l.status<>'Cancelled'
  union all select 'stalled_logistics','',l.id,l.supplier_name||' · '||p.name,'/dashboard/projects/'||p.id||'?tab=logistics#logistics-'||l.id,'No stage change ≥7 days; not a delivery deadline',null,l.status_at from ops_projects p join public.project_logistics l on l.project_id=p.id where l.status not in ('Delivered','Cancelled') and (l.status_at at time zone p.timezone)::date<=p.today-7
  union all select 'installations',coalesce(i.status,'Not Scheduled'),s.id,s.name||' · '||p.name,'/dashboard/projects/'||p.id||'?tab=installation#installation-'||s.id,coalesce(i.status,'Not Scheduled'),null,coalesce(i.updated_at,s.updated_at) from ops_projects p join public.spaces s on s.project_id=p.id and s.cancelled_at is null left join public.space_installations i on i.space_id=s.id
  union all select 'outstanding_installations','',s.id,s.name||' · '||p.name,'/dashboard/projects/'||p.id||'?tab=installation#installation-'||s.id,coalesce(i.status,'Not Scheduled'),null,coalesce(i.updated_at,s.updated_at) from ops_projects p join public.spaces s on s.project_id=p.id and s.cancelled_at is null left join public.space_installations i on i.space_id=s.id where coalesce(i.status,'Not Scheduled') not in ('Completed','Not Applicable')
  union all select 'workload',person.display_name||' · '||person.id,s.id,s.name||' · '||s.project_name,'/dashboard/projects/'||s.project_id||'#space-'||s.id,person.display_name,null,s.updated_at from spaces s join active p on p.id=s.project_id join public.profiles person on person.active and person.role='designer' and exists(select 1 from public.project_memberships pm where pm.project_id=s.project_id and pm.user_id=person.id and pm.membership_role='designer') and (person.id=s.primary_designer_id or exists(select 1 from public.space_supporters ss where ss.space_id=s.id and ss.user_id=person.id)) where viewer in ('lead_designer','system_administrator') and s.status<>'Completed'
 ),
 totals as (select key,count(*) count,sum(value)::text amount from source group by key),
 groups as (select key,bucket,count(*) count,sum(value)::text amount from source where bucket<>'' group by key,bucket),
 selected as (select id,label,href,detail,at from source where key=p_view and (p_bucket='' or bucket=p_bucket) order by at desc,id limit 25 offset (p_page-1)*25),
 people as (select distinct person.id,person.display_name from authorized p join public.profiles person on person.active and (person.id=p.lead_designer_id or exists(select 1 from public.project_memberships pm where pm.project_id=p.id and pm.user_id=person.id)) order by person.display_name,person.id limit 50)
 select jsonb_build_object('role',viewer,'as_of',now(),'metrics',coalesce((select jsonb_object_agg(key,jsonb_build_object('count',count,'amount',amount)) from totals),'{}'),
 'groups',coalesce((select jsonb_agg(to_jsonb(g) order by g.key,g.bucket) from groups g),'[]'),
 'records',coalesce((select jsonb_agg(to_jsonb(s)) from selected s),'[]'),
 'selected_count',(select count(*) from source where key=p_view and (p_bucket='' or bucket=p_bucket)),
 'people',coalesce((select jsonb_agg(to_jsonb(p)) from people p),'[]')) into result;
 return result;
end $$;
create function public.project_analytics(p_from date,p_to date,p_stage text default '',p_brand text default '',p_stakeholder uuid default null,p_view text default '',p_bucket text default '',p_page integer default 1)
returns jsonb language sql security invoker set search_path='' as $$select private.project_analytics(p_from,p_to,p_stage,p_brand,p_stakeholder,p_view,p_bucket,p_page)$$;
revoke all on function private.project_analytics(date,date,text,text,uuid,text,text,integer),public.project_analytics(date,date,text,text,uuid,text,text,integer) from public,anon,authenticated;
grant execute on function private.project_analytics(date,date,text,text,uuid,text,text,integer),public.project_analytics(date,date,text,text,uuid,text,text,integer) to authenticated;
