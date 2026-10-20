-- System Administrator is the authenticated superadmin. Preserve state/version,
-- financial integrity, validation, explicit confirmations and immutable history.
-- No role impersonation: require_role returns the actual actor role.
-- Preserve the assigned Operations Admin while recording an explicit admin acknowledgement.
alter table public.project_handoffs add column acknowledged_as_admin boolean not null default false;
do $$ declare c record; found_count integer:=0; begin
 for c in select conname from pg_constraint where conrelid='public.project_handoffs'::regclass and contype='c' and pg_get_constraintdef(oid) like '%acknowledged_by%primary_ops_id%' loop
  execute format('alter table public.project_handoffs drop constraint %I',c.conname); found_count:=found_count+1;
 end loop;
 if found_count<>1 then raise exception 'Unexpected handoff integrity constraint'; end if;
end $$;
alter table public.project_handoffs add constraint project_handoff_acknowledgement_integrity check(
 (status='Pending Acknowledgment' and acknowledged_by is null and acknowledged_at is null and not acknowledged_as_admin) or
 (status='Acknowledged' and acknowledged_by is not null and acknowledged_at is not null and (acknowledged_by=primary_ops_id or acknowledged_as_admin) and acknowledged_at>=assigned_at)
);
create or replace function private.protect_handoff_record() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' or old.superseded_at is not null or new.version<>old.version+1 then raise exception 'HISTORY_IMMUTABLE'; end if;
 if new.superseded_at is not null and (to_jsonb(new)-array['version','superseded_at'])=(to_jsonb(old)-array['version','superseded_at']) then return new; end if;
 if old.status='Pending Acknowledgment' and new.status='Acknowledged' and new.acknowledged_at is not null and (
   (not new.acknowledged_as_admin and new.acknowledged_by=old.primary_ops_id) or
   (new.acknowledged_as_admin and private.current_role()='system_administrator' and new.acknowledged_by=auth.uid())
 ) and (to_jsonb(new)-array['version','status','acknowledged_by','acknowledged_at','acknowledged_as_admin'])=(to_jsonb(old)-array['version','status','acknowledged_by','acknowledged_at','acknowledged_as_admin']) then return new; end if;
 raise exception 'HISTORY_IMMUTABLE';
end $$;

CREATE OR REPLACE FUNCTION private.assign_project_personnel(p_project uuid, p_primary uuid, p_support uuid[], p_ops uuid[], p_reason text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.app_role; owner uuid; stage public.commercial_status; closure uuid;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select lead_designer_id,commercial_status into owner,stage from public.projects where id=p_project for update;
 if not found or (r<>'system_administrator' and owner<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 if stage='Closed' and coalesce(cardinality(p_ops),0)=0 then raise exception 'OPERATIONS_ADMIN_REQUIRED'; end if;
 if exists(select 1 from public.projects where id=p_project and awaiting_handoff) and r not in ('lead_designer','system_administrator') then raise exception 'HANDOFF_LEAD_REQUIRED'; end if; perform private.set_project_assignments(p_project,p_primary,p_support,p_ops,p_reason);
 select id into closure from public.commercial_closures where project_id=p_project;
 if closure is not null and exists(select 1 from public.project_handoffs where project_id=p_project) then perform private.create_handoff(p_project,closure,p_ops[1],trim(p_reason)); end if;
end $function$;

CREATE OR REPLACE FUNCTION private.require_role(allowed app_role[])
 RETURNS app_role
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.app_role; enabled boolean;
begin
  if auth.uid() is null then raise exception 'AUTH_REQUIRED'; end if;
  select role,active into r,enabled from public.profiles where id=auth.uid() for share;
  if not coalesce(enabled,false) or (r<>'system_administrator' and not coalesce(r=any(allowed),false)) then raise exception 'ACCESS_DENIED'; end if;
  return r;
end; $function$;

CREATE OR REPLACE FUNCTION private.transition_commercial_stage(p_project uuid, p_expected_stage commercial_status, p_target commercial_status, p_reason text, p_confirm boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; r public.app_role; reason text:=trim(coalesce(p_reason,''));
begin
 r:=private.require_role(array['lead_designer','bdm','system_administrator']::public.app_role[]);
 select * into project from public.projects where id=p_project for update;
 if not found or not private.can_read_pipeline(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if p_target='Under Negotiation' then
  if r<>'system_administrator' and (r<>'lead_designer' or project.lead_designer_id<>auth.uid()) then raise exception 'ACCESS_DENIED'; end if;
 elsif p_target='Lost' then
  if r<>'system_administrator' and (r<>'bdm' or not private.sale_editor(p_project)) then raise exception 'ACCESS_DENIED'; end if;
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
 values(auth.uid(),p_project,'project',p_project,case when p_target='Lost' then 'commercial.lost' else 'commercial.sent_to_bdm' end,jsonb_build_object('commercial_status',project.commercial_status),jsonb_build_object('commercial_status',p_target,'reason',reason,'administrative_override',r='system_administrator'));
 insert into public.notifications(recipient_id,project_id,message)
 select distinct recipient,p_project,case when p_target='Lost' then project.name||' was marked Lost. Project records are now read-only.' else project.name||' is ready for BDM follow-up — Under Negotiation.' end
 from (select user_id recipient from public.project_memberships where project_id=p_project and membership_role in ('bdm','designer','lead_designer') union select project.lead_designer_id) people
 join public.profiles pr on pr.id=recipient and pr.active where recipient<>auth.uid();
end $function$;

CREATE OR REPLACE FUNCTION private.close_project_deal(p_project uuid, p_expected_stage commercial_status, p_price text, p_sale_version integer, p_reason text, p_confirm boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; closure uuid; sale_version integer; sale public.project_financial_values; reason text:=trim(coalesce(p_reason,''));
begin
 perform private.require_role(array['bdm','system_administrator']::public.app_role[]);
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
 values(p_project,project.commercial_status,p_price::numeric,sale_version,auth.uid(),private.current_role(),reason,private.current_role()='system_administrator') returning id into closure;
 update public.projects set commercial_status='Closed',awaiting_handoff=true where id=p_project;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),p_project,'project',p_project,'commercial.closed',jsonb_build_object('commercial_status',project.commercial_status),jsonb_build_object('closure_id',closure,'sale_amount',p_price::numeric(28,2)::text,'sale_version',sale_version,'reason',reason,'awaiting_handoff',true,'administrative_override',private.current_role()='system_administrator'));
 insert into public.notifications(recipient_id,project_id,message) values(project.lead_designer_id,p_project,project.name||' is Closed and awaiting your Operations Admin assignment and handoff.');
 return closure;
end $function$;

CREATE OR REPLACE FUNCTION private.close_project_sale(p_project uuid, p_expected_stage commercial_status, p_sale_version integer, p_primary_ops uuid, p_confirm boolean, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare amount text; begin
 perform private.require_role(array['bdm','system_administrator']::public.app_role[]);
 if not private.sale_editor(p_project) then raise exception 'ACCESS_DENIED'; end if;
 select v.amount::text into amount from public.project_financial_values v where project_id=p_project and kind='Sale';
 if amount is null then raise exception 'SALE_REQUIRED'; end if;
 return private.close_project_deal(p_project,p_expected_stage,amount,p_sale_version,p_reason,p_confirm);
end $function$;

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
 if project.commercial_status<>'Closed' or not project.awaiting_handoff or project.is_cancelled then raise exception 'INVALID_HANDOFF_STATE'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 select user_id into primary_designer from public.project_memberships where project_id=p_project and membership_role='designer' and is_primary;
 select coalesce(array_agg(user_id),'{}'::uuid[]) into supporters from public.project_memberships where project_id=p_project and membership_role='designer' and not is_primary;
 select array[p_primary_ops]||coalesce(array_agg(user_id) filter(where user_id<>p_primary_ops),'{}'::uuid[]) into ops from public.project_memberships where project_id=p_project and membership_role='operations_admin';
 perform private.assign_project_personnel(p_project,primary_designer,supporters,ops,p_reason); perform private.create_handoff(p_project,(select id from public.commercial_closures where project_id=p_project),p_primary_ops,trim(p_reason));
 select id into handoff from public.project_handoffs where project_id=p_project and superseded_at is null;
 if handoff is null then raise exception 'INVALID_HANDOFF_STATE'; end if;
 update public.projects set awaiting_handoff=false where id=p_project;
 return handoff;
end $function$;

CREATE OR REPLACE FUNCTION private.acknowledge_handoff(p_project uuid, p_handoff uuid, p_version integer, p_confirm boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.project_handoffs; current public.project_handoffs;
begin
 perform private.require_role(array['operations_admin','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project and commercial_status='Closed' and not is_cancelled for update;
 if not found or not private.can_read_pipeline(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if not coalesce(p_confirm,false) then raise exception 'CONFIRMATION_REQUIRED'; end if;
 select * into previous from public.project_handoffs where id=p_handoff and project_id=p_project and superseded_at is null for update;
 if not found or (private.current_role()<>'system_administrator' and (previous.primary_ops_id<>auth.uid() or not exists(select 1 from public.project_memberships where project_id=p_project and membership_role='operations_admin' and is_primary and user_id=auth.uid()))) then raise exception 'ACCESS_DENIED'; end if;
 if previous.status='Acknowledged' then raise exception 'HANDOFF_ALREADY_ACKNOWLEDGED'; end if;
 if previous.version is distinct from p_version then raise exception 'STALE_CLOSURE_CONTEXT'; end if;
 update public.project_handoffs set status='Acknowledged',acknowledged_by=auth.uid(),acknowledged_as_admin=private.current_role()='system_administrator',acknowledged_at=now(),version=version+1 where id=previous.id returning * into current;
 insert into public.handoff_events(project_id,handoff_id,action,actor_id,reason,previous_value,new_value) values(p_project,current.id,'acknowledged',auth.uid(),case when private.current_role()='system_administrator' then 'Acknowledged by System Administrator' else 'Receipt acknowledged' end,to_jsonb(previous),to_jsonb(current));
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p_project,'handoff',current.id,'handoff.acknowledged',to_jsonb(previous),to_jsonb(current));
end $function$;

CREATE OR REPLACE FUNCTION private.get_commercial_handoff(p_project uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare project public.projects; sale public.project_financial_values; closure public.commercial_closures; current public.project_handoffs; primary_ops uuid; result jsonb; timezone text;
begin
 if not private.handoff_reader(p_project) then raise exception 'ACCESS_DENIED'; end if;
 select * into project from public.projects where id=p_project;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into closure from public.commercial_closures where project_id=p_project;
 select * into current from public.project_handoffs where project_id=p_project and superseded_at is null;
 select m.user_id into primary_ops from public.project_memberships m join public.profiles p on p.id=m.user_id where m.project_id=p_project and m.membership_role='operations_admin' and m.is_primary and p.active and p.role='operations_admin';
 select coalesce(m.timezone,'Asia/Manila') into timezone from public.project_monitoring m where m.project_id=p_project;
 timezone:=coalesce(timezone,'Asia/Manila');
 result:=jsonb_build_object('project_id',p_project,'commercial_status',project.commercial_status,'cancelled',project.is_cancelled,'closed_at',closure.closed_at,
 'status',coalesce(current.status,case when project.commercial_status='Closed' then 'Awaiting Handoff' else 'Not Required' end),
 'current',case when current.id is null then null else to_jsonb(current) end,
 'age_days',case when closure.id is null then null else ((coalesce(current.acknowledged_at,now()) at time zone timezone)::date-(closure.closed_at at time zone timezone)::date) end,
 'can_acknowledge',not project.is_cancelled and current.status='Pending Acknowledgment' and (private.current_role()='system_administrator' or (private.current_role()='operations_admin' and primary_ops=auth.uid() and current.primary_ops_id=auth.uid())),
 'history',coalesce((select jsonb_agg(to_jsonb(h) order by h.number) from public.project_handoffs h where h.project_id=p_project),'[]'::jsonb),
 'events',coalesce((select jsonb_agg(to_jsonb(e) order by e.occurred_at,e.id) from public.handoff_events e where e.project_id=p_project),'[]'::jsonb));
 if private.current_role()<>'operations_admin' then
  select * into sale from public.project_financial_values where project_id=p_project and kind='Sale';
  result:=result||jsonb_build_object('sale',jsonb_build_object('amount',sale.amount::text,'version',coalesce(sale.version,0)),
   'closure',case when closure.id is null then null else to_jsonb(closure)||jsonb_build_object('sale_amount',closure.sale_amount::text) end,
   'primary_ops_id',primary_ops,'can_close',false,
   'administrative',private.current_role() in ('lead_designer','system_administrator'));
 end if;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION private.can_read_lead(target uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.leads l where l.id=target and (
  (private.current_role()='bdm' and l.bdm_id=auth.uid()) or
  private.current_role()='system_administrator' or
  (private.current_role()='lead_designer' and (l.status<>'Draft' or l.first_submitted_at is not null)
   and coalesce((select p.lead_designer_id from public.project_origins o join public.projects p on p.id=o.project_id where o.lead_id=l.id),l.assigned_lead_designer_id)=auth.uid())
 ));
$function$;

CREATE OR REPLACE FUNCTION private.save_lead(p_id uuid, p_expected_version integer, p_payload jsonb, p_submit boolean, p_duplicate_reason text DEFAULT ''::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare l public.leads; old_record jsonb; n text; a text; b text; c integer; d date; files jsonb; f jsonb; recipient uuid; selected_supplier uuid; supplier_record public.suppliers; supplier_label text; owner_id uuid;
begin
 
 perform private.require_role(array['bdm','system_administrator']::public.app_role[]);
 if private.current_role()='system_administrator' then
   select bdm_id into owner_id from public.leads where id=p_id;
   if owner_id is null then
     owner_id:=nullif(p_payload->>'bdm_id','')::uuid;
   elsif nullif(p_payload->>'bdm_id','')::uuid is not null and nullif(p_payload->>'bdm_id','')::uuid<>owner_id then
     raise exception 'ACCESS_DENIED';
   end if;
   perform 1 from public.profiles where id=owner_id and active and role='bdm' for share;
   if not found then raise exception 'INVALID_BDM'; end if;
 else
   owner_id:=auth.uid();
   if nullif(p_payload->>'bdm_id','')::uuid is not null and nullif(p_payload->>'bdm_id','')::uuid<>owner_id then raise exception 'ACCESS_DENIED'; end if;
 end if;
 
 recipient:=nullif(p_payload->>'assigned_lead_designer_id','')::uuid;
 if p_submit and recipient is null then raise exception 'INVALID_LEAD_DESIGNER'; end if;
 if recipient is not null then
  perform 1 from public.profiles where id=recipient and active and role='lead_designer' for share;
  if not found then raise exception 'INVALID_LEAD_DESIGNER'; end if;
 end if;
 
 selected_supplier:=nullif(p_payload->>'supplier_id','')::uuid;
 if selected_supplier is not null then
  select * into supplier_record from public.suppliers where id=selected_supplier for share;
  if not found then raise exception 'INVALID_LEAD_SUPPLIER'; end if;
  if not supplier_record.active and not exists(select 1 from public.leads where id=p_id and supplier_id=selected_supplier) then
   raise exception 'INVALID_LEAD_SUPPLIER';
  end if;
  supplier_label:=supplier_record.name;
  p_payload:=p_payload||jsonb_build_object('brand',supplier_record.brand);
 end if;
 n:=trim(coalesce(p_payload->>'project_name',''));
  a:=trim(coalesce(p_payload->>'address','')); b:=nullif(p_payload->>'brand','');
 c:=nullif(p_payload->>'cabinetry_count','')::integer; d:=nullif(p_payload->>'date_needed','')::date;
 if not private.valid_resource_links(coalesce(p_payload->'resource_links','[]'::jsonb)) then raise exception 'INVALID_RESOURCE_LINKS'; end if;
 files:=coalesce(p_payload->'attachment_metadata','[]'::jsonb);
 if p_payload is null or jsonb_typeof(p_payload)<>'object' or p_submit is null or p_expected_version is null or p_expected_version<0 or p_id is null
 or length(n)>200 or length(a)>2000 or length(coalesce(p_payload->>'notes',''))>10000 or length(coalesce(p_duplicate_reason,''))>2000
 or (b is not null and b not in ('SFY','Stosa','Both')) or (c is not null and c<1)
 or (p_submit and (n='' or a='' or c is null)) then raise exception 'INVALID_LEAD'; end if;
 if jsonb_typeof(files)<>'array' or jsonb_array_length(files)>5 then raise exception 'INVALID_ATTACHMENT_METADATA'; end if;
 for f in select value from jsonb_array_elements(files) loop
   if jsonb_typeof(f)<>'object' or length(trim(coalesce(f->>'name','')))=0 or length(f->>'name')>255
   or length(coalesce(f->>'mime_type',''))>150 or (f->>'size') is null
   or (f->>'size')::bigint<0 or (f->>'size')::bigint>52428800
   or coalesce(f->>'state','')<>'not_uploaded' then raise exception 'INVALID_ATTACHMENT_METADATA'; end if;
 end loop;
 -- Warn only about caller-visible records; do not leak other clients' names.
 if p_submit and length(trim(coalesce(p_duplicate_reason,'')))=0 and exists(select 1 from public.find_duplicate_leads(n,a,p_id)) then raise exception 'DUPLICATE_REASON_REQUIRED'; end if;
 insert into public.leads(id,bdm_id) values(p_id,owner_id) on conflict(id) do nothing;
 select * into l from public.leads where id=p_id for update;
 
 if l.bdm_id<>auth.uid() and private.current_role()<>'system_administrator' then raise exception 'ACCESS_DENIED'; end if;
 
 if p_expected_version is null or l.version<>p_expected_version then raise exception 'STALE_VERSION'; end if;
 if l.status not in ('Draft','Returned for Clarification') then raise exception 'INVALID_LEAD_STATE'; end if;
 if p_submit and exists(select 1 from public.attachments a join public.attachment_versions v on v.attachment_id=a.id where a.lead_id=l.id and a.archived_at is null and v.ready_at is null) then raise exception 'UPLOADS_PENDING'; end if;
 old_record:=to_jsonb(l);
 update public.leads set supplier_id=selected_supplier,supplier_name=supplier_label,assigned_lead_designer_id=recipient,project_name=n,address=a,brand=b,cabinetry_count=c,notes=coalesce(p_payload->>'notes',''),date_needed=d,
 resource_links=coalesce(p_payload->'resource_links','[]'::jsonb),attachment_metadata=files,status=case when p_submit then 'Submitted'::public.lead_status else l.status end,
 version=l.version+1,submission_count=l.submission_count+case when p_submit then 1 else 0 end,
 first_submitted_at=case when p_submit then coalesce(l.first_submitted_at,now()) else l.first_submitted_at end,
 last_submitted_at=case when p_submit then now() else l.last_submitted_at end,updated_at=now()
 where id=p_id returning * into l;
 if p_submit then
   insert into public.lead_submissions(lead_id,number,snapshot,submitted_by)
   values(l.id,l.submission_count,to_jsonb(l)||jsonb_build_object('duplicate_override_reason',trim(coalesce(p_duplicate_reason,'')),'uploaded_attachments',coalesce((select jsonb_agg(to_jsonb(x)) from (select distinct on (a.id) a.id as attachment_id,v.id as version_id,v.original_name,v.actual_size from public.attachments a join public.attachment_versions v on v.attachment_id=a.id where a.lead_id=l.id and a.archived_at is null and v.ready_at is not null order by a.id,v.created_at desc) x),'[]'::jsonb)),auth.uid());
   insert into public.notifications(recipient_id,lead_id,message)
   select id,l.id,'A submitted lead is ready for review.' from public.profiles where id=recipient and active and role='lead_designer';
 end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value)
 values(auth.uid(),'lead',l.id,case when p_submit then 'lead.submitted' else 'lead.draft_saved' end,old_record,to_jsonb(l));
 return l.id;
end; $function$;

CREATE OR REPLACE FUNCTION private.save_calendar_event(p_id uuid, p_version integer, p_data jsonb, p_cancel boolean DEFAULT false, p_reason text DEFAULT ''::text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare previous public.calendar_events; current public.calendar_events; who uuid:=auth.uid();
begin
 if who is null or private.current_role() is null then raise exception 'ACCESS_DENIED'; end if;
 if p_version is null or p_version<0 or p_cancel is null then raise exception 'INVALID_EVENT'; end if;
 perform pg_advisory_xact_lock(hashtextextended('calendar:'||p_id::text,0));
 select * into previous from public.calendar_events where id=p_id for update;
 if found then
  if previous.owner_id<>who and private.current_role()<>'system_administrator' then raise exception 'ACCESS_DENIED'; end if;
  if previous.version<>p_version or previous.cancelled_at is not null then raise exception 'STALE_EVENT'; end if;
  if coalesce(length(trim(p_reason)),0) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
  if p_cancel then
   update public.calendar_events set cancelled_at=now(),version=version+1,updated_at=now() where id=p_id returning * into current;
  else
   update public.calendar_events set title=trim(p_data->>'title'),event_date=(p_data->>'date')::date,end_date=(p_data->>'end_date')::date,start_time=nullif(p_data->>'time','')::time,end_time=nullif(p_data->>'end_time','')::time,location=coalesce(p_data->>'location',''),notes=coalesce(p_data->>'notes',''),version=version+1,updated_at=now() where id=p_id returning * into current;
  end if;
 else
  if p_version<>0 or p_cancel then raise exception 'STALE_EVENT'; end if;
  insert into public.calendar_events(id,owner_id,title,event_date,end_date,start_time,end_time,location,notes) values(p_id,who,trim(p_data->>'title'),(p_data->>'date')::date,(p_data->>'end_date')::date,nullif(p_data->>'time','')::time,nullif(p_data->>'end_time','')::time,coalesce(p_data->>'location',''),coalesce(p_data->>'notes','')) returning * into current;
 end if;
 insert into public.calendar_event_history(event_id,owner_id,version,previous_value,new_value,reason) values(p_id,current.owner_id,current.version,case when previous.id is not null then to_jsonb(previous) else null end,to_jsonb(current),coalesce(p_reason,''));
 -- System audit has operation metadata only; personal titles/dates/notes stay owner-private.
 insert into public.audit_events(actor_id,entity_type,entity_id,action,previous_value,new_value) values(who,'calendar_event',p_id,case when p_cancel then 'calendar.event_cancelled' when p_version=0 then 'calendar.event_created' else 'calendar.event_updated' end,case when previous.id is not null then jsonb_build_object('version',previous.version) else null end,jsonb_build_object('version',current.version));
 return current.version;
end $function$;

CREATE OR REPLACE FUNCTION private.attachment_scope(p_lead uuid, p_project uuid, p_class text, p_write boolean)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.app_role; inherited uuid;
begin
 r:=private.current_role(); if r is null then return false; end if;
 if p_lead is not null then
  select project_id into inherited from public.project_origins where lead_id=p_lead;
  if inherited is not null then return private.attachment_scope(null,inherited,p_class,p_write); end if;
  if p_class<>'general' then return false; end if;
  if p_write then return exists(select 1 from public.leads where id=p_lead and (bdm_id=auth.uid() or r='system_administrator') and status in ('Draft','Returned for Clarification')) and r in ('bdm','system_administrator'); end if;
  return private.can_read_lead(p_lead);
 end if;
 if p_write and exists(select 1 from public.projects where id=p_project and commercial_status='Lost') then return false; end if; if not private.can_read_pipeline(p_project) then return false; end if;
 if r='system_administrator' then return true; end if;
 if r='operations_admin' then return p_class='operations' and exists(select 1 from public.projects where id=p_project and commercial_status='Closed'); end if;
 if r='bdm' then return p_class='general'; end if;
 if r='designer' then return p_class in ('general','design'); end if;
 return r='lead_designer';
end $function$;

CREATE OR REPLACE FUNCTION private.complete_attachment(p_version uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v public.attachment_versions; a public.attachments; actual bigint;
begin
 perform private.require_role(array['bdm','designer','lead_designer','operations_admin','system_administrator']::public.app_role[]);
 select * into v from public.attachment_versions where id=p_version;
 if not found then raise exception 'ACCESS_DENIED'; end if;
 select * into a from public.attachments where id=v.attachment_id;
 perform private.lock_attachment_parent(a.lead_id,a.project_id);
 select * into v from public.attachment_versions where id=p_version for update;
 if not found or (v.created_by<>auth.uid() and private.current_role()<>'system_administrator') then raise exception 'ACCESS_DENIED'; end if;
 select * into a from public.attachments where id=v.attachment_id for share;
 if a.archived_at is not null or not private.attachment_scope(a.lead_id,a.project_id,a.classification,true) then raise exception 'ACCESS_DENIED'; end if;
 if v.ready_at is not null then return; end if;
 if not exists(select 1 from public.attachment_versions where attachment_id=a.id and ready_at is not null) and (private.attachment_slots(a.lead_id,a.project_id)->>'uploaded')::integer>=3 then raise exception 'ATTACHMENT_COUNT_LIMIT'; end if;
 select (metadata->>'size')::bigint into actual from storage.objects where bucket_id='one-odc-attachments' and name=v.object_path;
 if actual is null or actual<>v.expected_size then raise exception 'STORAGE_OBJECT_NOT_VERIFIED'; end if;
 update public.attachment_versions set ready_at=now(),actual_size=actual where id=v.id;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),a.project_id,'attachment',a.id,'attachment.upload_completed',jsonb_build_object('version_id',v.id,'actual_size',actual));
end $function$;

CREATE OR REPLACE FUNCTION private.can_read_attachment_object(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.attachment_versions v join public.attachments a on a.id=v.attachment_id
 where v.object_path=p_path and a.archived_at is null and private.attachment_scope(a.lead_id,a.project_id,a.classification,false)
 and (v.ready_at is not null or ((v.created_by=(select auth.uid()) or (select private.current_role())='system_administrator') and v.created_at>now()-interval '24 hours')))
$function$;

CREATE OR REPLACE FUNCTION private.can_upload_attachment_object(p_path text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(select 1 from public.attachment_versions v join public.attachments a on a.id=v.attachment_id
 where v.object_path=p_path and (v.created_by=(select auth.uid()) or (select private.current_role())='system_administrator') and v.ready_at is null and v.created_at>now()-interval '24 hours'
 and a.archived_at is null and (a.lead_id is null or exists(select 1 from public.project_origins o where o.lead_id=a.lead_id)) and private.attachment_scope(a.lead_id,a.project_id,a.classification,true)
 and (exists(select 1 from public.attachment_versions old where old.attachment_id=a.id and old.ready_at is not null)
 or (private.attachment_slots(a.lead_id,a.project_id)->>'uploaded')::integer<3))
$function$;

alter policy calendar_owner_read on public.calendar_events using ((select private.current_role()) is not null and (owner_id=(select auth.uid()) or (select private.current_role())='system_administrator'));
alter policy calendar_history_owner on public.calendar_event_history using ((select private.current_role()) is not null and (owner_id=(select auth.uid()) or (select private.current_role())='system_administrator'));


CREATE OR REPLACE FUNCTION public.workspace_calendar(p_from date, p_to date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if auth.uid() is null or private.current_role() is null then raise exception 'ACCESS_DENIED'; end if;
 if p_from is null or p_to is null or p_to<p_from or p_to-p_from>62 then raise exception 'INVALID_RANGE'; end if;
 with events as (
 select 'project:'||p.id as id,'Project deadline'::text as kind,p.name as title,p.reference as subtitle,m.deadline as date,m.deadline as end_date,null::time as time,null::time as end_time,'/dashboard/projects/'||p.id as href,case when p.is_operationally_completed then 'Completed' else m.state end as status,m.timezone,0 as version,''::text as notes,''::text as location
 from public.projects p join public.project_monitoring m on m.project_id=p.id where p.commercial_status<>'Lost' and not p.is_cancelled and m.deadline between p_from and p_to
 union all
 select 'space:'||s.id,'Space deadline',s.name,p.name,s.deadline,s.deadline,null,null,'/dashboard/projects/'||p.id||'#space-'||s.id,s.status::text,m.timezone,0,'',''
 from public.spaces s join public.projects p on p.id=s.project_id join public.project_monitoring m on m.project_id=p.id where p.commercial_status<>'Lost' and s.cancelled_at is null and not p.is_cancelled and s.deadline between p_from and p_to
 union all
 select 'installation:'||i.space_id,'Installation',s.name,p.name,i.scheduled_date,i.scheduled_date,null,null,'/dashboard/projects/'||p.id||'?tab=installation#installation-'||s.id,i.status::text,m.timezone,0,'',''
 from public.space_installations i join public.spaces s on s.id=i.space_id join public.projects p on p.id=i.project_id join public.project_monitoring m on m.project_id=p.id where p.commercial_status<>'Lost' and s.cancelled_at is null and not p.is_cancelled and i.status<>'Not Applicable' and i.scheduled_date between p_from and p_to
 union all
 select 'handoff:'||p.id,'Expected handoff',p.name,p.reference,p.expected_handoff,p.expected_handoff,null,null,'/dashboard/projects/'||p.id,p.commercial_status::text,'Asia/Manila',0,'',''
 from public.projects p where p.commercial_status<>'Lost' and not p.is_cancelled and p.expected_handoff between p_from and p_to
 union all
 select 'lead:'||l.id,'Lead requested date',l.project_name,l.reference,l.date_needed,l.date_needed,null,null,'/dashboard/leads/'||l.id,l.status::text,'Asia/Manila',0,'',''
 from public.leads l where l.status in ('Draft','Submitted','Returned for Clarification') and l.date_needed between p_from and p_to
 union all
 select e.id::text,'Personal event',e.title,case when e.owner_id=auth.uid() then 'Your event' else coalesce((select p.display_name from public.profiles p where p.id=e.owner_id),'Other user')||' · Personal event' end,e.event_date,e.end_date,e.start_time,e.end_time,null,'Scheduled','Asia/Manila',e.version,e.notes,e.location
 from public.calendar_events e where e.cancelled_at is null and e.event_date<=p_to and e.end_date>=p_from
 ) select coalesce(jsonb_agg(to_jsonb(e) order by e.date,e.time nulls first,e.kind,e.title,e.id),'[]'::jsonb) into result from events e;
 return result;
end $function$;

-- Superadmin can inspect/manage a selected recipient inbox; own inbox stays default.
alter policy notification_read on public.notifications using (
 (select private.current_role()) is not null and
 (recipient_id=(select auth.uid()) or (select private.current_role())='system_administrator') and
 (type is distinct from 'project_mention' or private.can_read_spaces(project_id))
);
create or replace function private.mark_notification_read(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare recipient uuid;
begin
 perform private.require_role(enum_range(null::public.app_role));
 select recipient_id into recipient from public.notifications where id=p_id for update;
 if not found or (recipient<>auth.uid() and private.current_role()<>'system_administrator') then raise exception 'ACCESS_DENIED'; end if;
 update public.notifications set read_at=coalesce(read_at,now()) where id=p_id;
 if recipient<>auth.uid() then
  insert into public.audit_events(actor_id,entity_type,entity_id,action,new_value) values(auth.uid(),'notification',p_id,'notification.admin_marked_read',jsonb_build_object('recipient_id',recipient));
 end if;
end $$;
create function private.mark_recipient_notifications_read(p_recipient uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 perform private.require_role(enum_range(null::public.app_role));
 if p_recipient is null or (p_recipient<>auth.uid() and private.current_role()<>'system_administrator') then raise exception 'ACCESS_DENIED'; end if;
 update public.notifications set read_at=now() where recipient_id=p_recipient and read_at is null;
 get diagnostics affected=row_count;
 if p_recipient<>auth.uid() then
  insert into public.audit_events(actor_id,entity_type,entity_id,action,new_value) values(auth.uid(),'profile',p_recipient,'notification.admin_marked_all_read',jsonb_build_object('count',affected));
 end if;
 return affected;
end $$;
create function public.mark_recipient_notifications_read(p_recipient uuid) returns integer
language sql security invoker set search_path='' as $$select private.mark_recipient_notifications_read(p_recipient)$$;
revoke all on function private.mark_recipient_notifications_read(uuid),public.mark_recipient_notifications_read(uuid) from public,anon;
grant execute on function private.mark_recipient_notifications_read(uuid),public.mark_recipient_notifications_read(uuid) to authenticated;


