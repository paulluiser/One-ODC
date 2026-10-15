-- Preserve each completed cycle calendar boundary independently across timezone revisions.
create or replace function private.project_analytics(p_from date,p_to date,p_stage text default '',p_brand text default '',p_stakeholder uuid default null,p_view text default '',p_bucket text default '',p_page integer default 1)
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
   (select sum(greatest(0,(cy.ended_at at time zone zone.timezone)::date-(cy.started_at at time zone zone.timezone)::date))
    from public.project_operational_cycles cy
    left join public.operational_completions historical on historical.project_id=cy.project_id and historical.cycle_number=cy.number
    left join lateral(select a.new_value from public.audit_events a where a.project_id=cy.project_id and a.action='project.deadline_revised' and a.occurred_at<=cy.ended_at order by a.occurred_at desc,(a.new_value->>'version')::integer desc limit 1) prior_zone on true
    left join lateral(select a.previous_value from public.audit_events a where a.project_id=cy.project_id and a.action='project.deadline_revised' and a.occurred_at>cy.ended_at order by a.occurred_at,(a.new_value->>'version')::integer limit 1) later_zone on true
    cross join lateral(select coalesce(historical.snapshot->'monitoring'->>'timezone',prior_zone.new_value->>'timezone',later_zone.previous_value->>'timezone','Asia/Manila') timezone) zone
    where cy.project_id=p.id and cy.number<=c.cycle_number and cy.ended_at is not null) duration
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
