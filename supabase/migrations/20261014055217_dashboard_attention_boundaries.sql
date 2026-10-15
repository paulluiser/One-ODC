-- Keep the applied dashboard source immutable; refine due work and closed date windows.
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
 project_risk as materialized (
  select p.id,p.name,p.created_at,
   case when p.deadline<p.today or exists(select 1 from design_spaces s where s.project_id=p.id and s.status<>'Completed' and s.deadline<p.today) then 'Overdue'
    when private.dashboard_risk(p.deadline,(greatest(p.created_at,(select max(s.last_progress_at) from public.spaces s where s.project_id=p.id and s.cancelled_at is null),(select max(a.activity_date::timestamp at time zone p.timezone) from public.project_activities a where a.project_id=p.id and a.category in ('Design Work','Revision','Site Visit','Supplier Update','Installation'))) at time zone p.timezone)::date,p.today)='At Risk'
     or exists(select 1 from design_spaces s where s.project_id=p.id and s.status<>'Completed' and private.dashboard_risk(s.deadline,(s.progress_at at time zone p.timezone)::date,p.today)='At Risk') then 'At Risk' else 'On Track' end risk
  from active p where viewer_role='lead_designer'
 ),
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
  union all select 'recent_completed',p.id,p.name,'/dashboard/projects/'||p.id,'Operationally completed · '||c.completed_at::text,null,c.completed_at from projects p join lateral(select * from public.operational_completions c where c.project_id=p.id order by cycle_number desc limit 1)c on true where viewer_role='lead_designer' and p.is_operationally_completed and not p.is_cancelled and (c.completed_at at time zone p.timezone)::date between p.today-13 and p.today
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
  join public.profiles person on person.active and person.role='designer' and (person.id=s.primary_designer_id or exists(select 1 from public.space_supporters ss where ss.space_id=s.id and ss.user_id=person.id))
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
