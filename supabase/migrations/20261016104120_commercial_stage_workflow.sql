-- Terminal commercial loss is independent of cancellation/design completion.
alter table public.projects add column lost_at timestamptz, add column lost_reason text;
alter table public.projects add constraint lost_context check (
 (commercial_status='Lost' and lost_at is not null and length(trim(lost_reason)) between 1 and 2000)
 or (commercial_status<>'Lost' and lost_at is null and lost_reason is null)
);

create function private.assert_project_not_lost(p_project uuid) returns void
language plpgsql security definer set search_path='' as $$
begin
 -- Serialize child writes with commercial transitions. No change may commit after loss.
 perform 1 from public.projects where id=p_project and commercial_status='Lost' for share;
 if found then raise exception 'PROJECT_LOST_READ_ONLY'; end if;
 -- Lock non-lost rows too: a concurrent loss waits for a genuine in-flight write.
 perform 1 from public.projects where id=p_project for share;
 if exists(select 1 from public.projects where id=p_project and commercial_status='Lost') then raise exception 'PROJECT_LOST_READ_ONLY'; end if;
end $$;
revoke all on function private.assert_project_not_lost(uuid) from public,anon,authenticated;

create function private.guard_lost_project_write() returns trigger
language plpgsql security definer set search_path='' as $$
declare row_data jsonb; previous_data jsonb; p uuid; previous_project uuid; a public.attachments;
begin
 row_data:=case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 if TG_TABLE_NAME='projects' then
  if TG_OP<>'INSERT' and old.commercial_status='Lost' then raise exception 'PROJECT_LOST_READ_ONLY'; end if;
  return case when TG_OP='DELETE' then old else new end;
 end if;
 p:=nullif(row_data->>'project_id','')::uuid;
 if TG_TABLE_NAME='leads' then
  select project_id into p from public.project_origins where lead_id=(row_data->>'id')::uuid;
 elsif TG_TABLE_NAME='space_supporters' then
  select project_id into p from public.spaces where id=(row_data->>'space_id')::uuid;
 elsif TG_TABLE_NAME='comment_mentions' then
  select project_id into p from public.project_comments where id=(row_data->>'comment_id')::uuid;
 elsif TG_TABLE_NAME='attachment_versions' then
  select * into a from public.attachments where id=(row_data->>'attachment_id')::uuid;
  p:=a.project_id;
  if p is null then select project_id into p from public.project_origins where lead_id=a.lead_id; end if;
 elsif TG_TABLE_NAME='attachments' and p is null then
  select project_id into p from public.project_origins where lead_id=(row_data->>'lead_id')::uuid;
 end if;
 if p is not null then perform private.assert_project_not_lost(p); end if;
 if TG_OP='UPDATE' then
  previous_data:=to_jsonb(old); previous_project:=nullif(previous_data->>'project_id','')::uuid;
  if previous_project is not null and previous_project is distinct from p then perform private.assert_project_not_lost(previous_project); end if;
 end if;
 return case when TG_OP='DELETE' then old else new end;
end $$;
revoke all on function private.guard_lost_project_write() from public,anon,authenticated;
do $$ declare t text; begin
 foreach t in array array['projects','leads','project_origins','project_memberships','project_assignment_events','project_monitoring','project_holds','project_operational_cycles','project_site_coordinators','project_activities','project_activity_versions','spaces','space_supporters','space_events','quotations','quotation_versions','quotation_items','quotation_draft_events','quotation_review_events','project_financial_values','financial_value_events','project_payments','payment_events','commercial_closures','project_handoffs','handoff_events','project_logistics','logistics_events','space_installations','installation_events','operational_completions','attachments','attachment_versions','project_comments','comment_mentions','space_template_applications'] loop
  execute format('create trigger commercial_loss_read_only before insert or update or delete on public.%I for each row execute function private.guard_lost_project_write()',t);
 end loop;
end $$;

create function private.transition_commercial_stage(p_project uuid,p_expected_stage public.commercial_status,p_target public.commercial_status,p_reason text,p_confirm boolean) returns void
language plpgsql security definer set search_path='' as $$
declare project public.projects; r public.app_role; reason text:=trim(coalesce(p_reason,''));
begin
 r:=private.require_role(array['lead_designer','bdm']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or not private.can_read_pipeline(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if p_target='Under Negotiation' then
  if r<>'lead_designer' or project.lead_designer_id<>auth.uid() then raise exception 'ACCESS_DENIED'; end if;
 elsif p_target='Lost' then
  if r<>'bdm' or not private.sale_editor(p_project) then raise exception 'ACCESS_DENIED'; end if;
 else raise exception 'INVALID_COMMERCIAL_TRANSITION'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if reason='' or length(reason)>2000 then raise exception 'REASON_REQUIRED'; end if;
 if project.commercial_status='Lost' then raise exception 'PROJECT_LOST_READ_ONLY'; end if;
 if project.commercial_status is distinct from p_expected_stage then raise exception 'STALE_COMMERCIAL_STAGE'; end if;
 if project.is_cancelled or project.is_operationally_completed then raise exception 'PROJECT_RESOLVED'; end if;
 if (p_target='Under Negotiation' and project.commercial_status<>'For Quotation') or
    (p_target='Lost' and project.commercial_status not in ('For Quotation','Under Negotiation')) then raise exception 'INVALID_COMMERCIAL_TRANSITION'; end if;
 update public.projects set commercial_status=p_target,lost_at=case when p_target='Lost' then now() end,lost_reason=case when p_target='Lost' then reason end where id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'project',p_project,case when p_target='Lost' then 'commercial.lost' else 'commercial.sent_to_bdm' end,jsonb_build_object('commercial_status',project.commercial_status),jsonb_build_object('commercial_status',p_target,'reason',reason));
 insert into public.notifications(recipient_id,project_id,message)
 select distinct recipient,p_project,case when p_target='Lost' then project.name||' was marked Lost. Project records are now read-only.' else project.name||' is ready for BDM follow-up — Under Negotiation.' end
 from (select user_id recipient from public.project_memberships where project_id=p_project and membership_role in ('bdm','designer','lead_designer') union select project.lead_designer_id) people
 join public.profiles pr on pr.id=recipient and pr.active where recipient<>auth.uid();
end $$;
create function public.transition_commercial_stage(p_project uuid,p_expected_stage public.commercial_status,p_target public.commercial_status,p_reason text,p_confirm boolean) returns void
language sql security invoker set search_path='' as $$ select private.transition_commercial_stage($1,$2,$3,$4,$5); $$;
revoke all on function private.transition_commercial_stage(uuid,public.commercial_status,public.commercial_status,text,boolean),public.transition_commercial_stage(uuid,public.commercial_status,public.commercial_status,text,boolean) from public,anon;
grant execute on function private.transition_commercial_stage(uuid,public.commercial_status,public.commercial_status,text,boolean),public.transition_commercial_stage(uuid,public.commercial_status,public.commercial_status,text,boolean) to authenticated;

-- Update established reporting definitions without changing authorization or monetary calculations.
do $$ declare f record; definition text; begin
 for f in select p.oid,p.proname from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='private' and p.proname in ('role_dashboard','project_analytics','calendar_events') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(definition,'''Negotiation''','''Under Negotiation''');
  definition:=replace(definition,'''Under Negotiation'',''Closed'',''Completed''','''Under Negotiation'',''Closed'',''Lost'',''Completed''');
  definition:=replace(definition,'where not is_cancelled and not is_operationally_completed','where commercial_status<>''Lost'' and not is_cancelled and not is_operationally_completed');
  definition:=replace(definition,'where not p.is_cancelled and','where p.commercial_status<>''Lost'' and not p.is_cancelled and');
  execute definition;
 end loop;
end $$;

alter table public.projects add column awaiting_handoff boolean not null default false;

create function private.close_project_deal(p_project uuid,p_expected_stage public.commercial_status,p_price text,p_sale_version integer,p_reason text,p_confirm boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare project public.projects; closure uuid; sale_version integer; sale public.project_financial_values; reason text:=trim(coalesce(p_reason,''));
begin
 perform private.require_role(array['bdm']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or not private.sale_editor(p_project) then raise exception 'ACCESS_DENIED'; end if;
 perform private.assert_project_not_lost(p_project);
 if project.commercial_status='Closed' then raise exception 'SALE_ALREADY_CLOSED'; end if;
 if project.commercial_status is distinct from p_expected_stage then raise exception 'STALE_COMMERCIAL_STAGE'; end if;
 if project.commercial_status<>'Under Negotiation' or project.is_cancelled or project.is_operationally_completed then raise exception 'INVALID_COMMERCIAL_TRANSITION'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if reason='' or length(reason)>2000 then raise exception 'REASON_REQUIRED'; end if;
 if p_price is null or p_price!~ '^(0|[1-9][0-9]{0,25})([.][0-9]{1,2})?$' then raise exception 'INVALID_AMOUNT'; end if;
 select * into sale from public.project_financial_values where project_id=p_project and kind='Sale';
 if p_sale_version is distinct from coalesce(sale.version,0) then raise exception 'STALE_CLOSURE_CONTEXT'; end if;
 if sale.version is not null and sale.amount=p_price::numeric then sale_version:=sale.version;
 else sale_version:=private.set_financial_value(p_project,'Sale',p_price,p_sale_version,reason); end if;
 insert into public.commercial_closures(project_id,previous_stage,sale_amount,sale_version,closed_by,actor_role,reason,administrative_override)
 values(p_project,project.commercial_status,p_price::numeric,sale_version,auth.uid(),'bdm',reason,false) returning id into closure;
 update public.projects set commercial_status='Closed',awaiting_handoff=true where id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'project',p_project,'commercial.closed',jsonb_build_object('commercial_status',project.commercial_status),jsonb_build_object('closure_id',closure,'sale_amount',p_price::numeric(28,2)::text,'sale_version',sale_version,'reason',reason,'awaiting_handoff',true,'administrative_override',false));
 insert into public.notifications(recipient_id,project_id,message) values(project.lead_designer_id,p_project,project.name||' is Closed and awaiting your Operations Admin assignment and handoff.');
 return closure;
end $$;
create function public.close_project_deal(p_project uuid,p_expected_stage public.commercial_status,p_price text,p_sale_version integer,p_reason text,p_confirm boolean) returns uuid
language sql security invoker set search_path='' as $$select private.close_project_deal($1,$2,$3,$4,$5,$6)$$;
revoke all on function private.close_project_deal(uuid,public.commercial_status,text,integer,text,boolean),public.close_project_deal(uuid,public.commercial_status,text,integer,text,boolean) from public,anon;
grant execute on function private.close_project_deal(uuid,public.commercial_status,text,integer,text,boolean),public.close_project_deal(uuid,public.commercial_status,text,integer,text,boolean) to authenticated;

-- Retain the old signature as a safe compatibility endpoint, with the new BDM-only rules.
create or replace function private.close_project_sale(p_project uuid,p_expected_stage public.commercial_status,p_sale_version integer,p_primary_ops uuid,p_confirm boolean,p_reason text) returns uuid
language plpgsql security definer set search_path='' as $$
declare amount text; begin
 perform private.require_role(array['bdm']::public.app_role[]);
 if not private.sale_editor(p_project) then raise exception 'ACCESS_DENIED'; end if;
 select v.amount::text into amount from public.project_financial_values v where project_id=p_project and kind='Sale';
 if amount is null then raise exception 'SALE_REQUIRED'; end if;
 return private.close_project_deal(p_project,p_expected_stage,amount,p_sale_version,p_reason,p_confirm);
end $$;

create function private.handoff_closed_project(p_project uuid,p_primary_ops uuid,p_reason text,p_confirm boolean) returns uuid
language plpgsql security definer set search_path='' as $$
declare project public.projects; primary_designer uuid; supporters uuid[]; ops uuid[]; handoff uuid;
begin
 perform private.require_role(array['lead_designer']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or project.lead_designer_id<>auth.uid() then raise exception 'ACCESS_DENIED'; end if;
 if project.commercial_status<>'Closed' or not project.awaiting_handoff or project.is_cancelled then raise exception 'INVALID_HANDOFF_STATE'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 select user_id into primary_designer from public.project_memberships where project_id=p_project and membership_role='designer' and is_primary;
 select coalesce(array_agg(user_id),'{}'::uuid[]) into supporters from public.project_memberships where project_id=p_project and membership_role='designer' and not is_primary;
 select array[p_primary_ops]||coalesce(array_agg(user_id) filter(where user_id<>p_primary_ops),'{}'::uuid[]) into ops from public.project_memberships where project_id=p_project and membership_role='operations_admin';
 perform private.assign_project_personnel(p_project,primary_designer,supporters,ops,p_reason);
 select id into handoff from public.project_handoffs where project_id=p_project and superseded_at is null;
 if handoff is null then raise exception 'INVALID_HANDOFF_STATE'; end if;
 update public.projects set awaiting_handoff=false where id=p_project;
 return handoff;
end $$;
create function public.handoff_closed_project(p_project uuid,p_primary_ops uuid,p_reason text,p_confirm boolean) returns uuid
language sql security invoker set search_path='' as $$select private.handoff_closed_project($1,$2,$3,$4)$$;
revoke all on function private.handoff_closed_project(uuid,uuid,text,boolean),public.handoff_closed_project(uuid,uuid,text,boolean) from public,anon;
grant execute on function private.handoff_closed_project(uuid,uuid,text,boolean),public.handoff_closed_project(uuid,uuid,text,boolean) to authenticated;

-- Keep assigned Operations accounts out of closed-project details until the Lead hands off.
do $$ declare definition text; begin
 definition:=pg_get_functiondef('private.can_read_pipeline(uuid)'::regprocedure);
 definition:=replace(definition,'select private.current_role() is not null and (','select private.current_role() is not null and (private.current_role()<>''operations_admin'' or not exists(select 1 from public.projects where id=target_project and awaiting_handoff)) and (');
 execute definition;
 definition:=pg_get_functiondef('private.assign_project_personnel(uuid,uuid,uuid[],uuid[],text)'::regprocedure);
 definition:=replace(definition,'perform private.set_project_assignments', 'if exists(select 1 from public.projects where id=p_project and awaiting_handoff) and r<>''lead_designer'' then raise exception ''HANDOFF_LEAD_REQUIRED''; end if; perform private.set_project_assignments');
 definition:=replace(definition,'if closure is not null then perform private.create_handoff(p_project,closure,p_ops[1],trim(p_reason)); end if;', 'if closure is not null then perform private.create_handoff(p_project,closure,p_ops[1],trim(p_reason)); update public.projects set awaiting_handoff=false where id=p_project; end if;');
 execute definition;
 definition:=pg_get_functiondef('private.get_commercial_handoff(uuid)'::regprocedure);
 definition:=replace(definition,'''Legacy Closed — no recorded handoff''','''Awaiting Handoff''');
 definition:=replace(definition,'not project.is_cancelled and project.commercial_status<>''Closed'' and (private.sale_editor(p_project) or (private.current_role()=''lead_designer'' and private.space_manager(p_project)))','false');
 execute definition;
 -- Existing Storage policies continue to apply, but no upload (including a pre-loss reservation) is writable after loss.
 definition:=pg_get_functiondef('private.attachment_scope(uuid,uuid,text,boolean)'::regprocedure);
 definition:=replace(definition,'if not private.can_read_pipeline(p_project)', 'if p_write and exists(select 1 from public.projects where id=p_project and commercial_status=''Lost'') then return false; end if; if not private.can_read_pipeline(p_project)');
 execute definition;
 definition:=pg_get_functiondef('public.workspace_calendar(date,date)'::regprocedure);
 definition:=replace(definition,'where not p.is_cancelled and','where p.commercial_status<>''Lost'' and not p.is_cancelled and');
 definition:=replace(definition,'where s.cancelled_at is null and not p.is_cancelled','where p.commercial_status<>''Lost'' and s.cancelled_at is null and not p.is_cancelled');
 execute definition;
end $$;
