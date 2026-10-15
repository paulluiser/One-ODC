-- Immutable complete submissions, review metadata and logical item identity across versions.
-- A default backfills logical identity without UPDATE-triggering protected cancelled items.
alter table public.quotation_items add column lineage_id uuid not null default gen_random_uuid();
create unique index quotation_item_lineage on public.quotation_items(version_id,lineage_id);
alter table public.quotation_versions
 add column source_version_id uuid,
 add column snapshot jsonb,
 add column submitted_at timestamptz, add column submitted_by uuid references public.profiles(id),
 add column reviewed_at timestamptz, add column reviewed_by uuid references public.profiles(id),
 add column review_remarks text,
 add constraint quotation_source_project foreign key(source_version_id,project_id) references public.quotation_versions(id,project_id),
 add constraint quotation_state check(state in ('Draft','Submitted for Review','Approved','Returned for Revision')),
 add constraint quotation_locked_snapshot check((state='Draft' and snapshot is null and submitted_at is null and submitted_by is null) or (state<>'Draft' and snapshot is not null and submitted_at is not null and submitted_by is not null));
create index quotation_versions_source on public.quotation_versions(source_version_id);
create index quotation_versions_submitter on public.quotation_versions(submitted_by);
create index quotation_versions_reviewer on public.quotation_versions(reviewed_by);
create unique index quotation_inflight on public.quotation_versions(quotation_id) where state in ('Draft','Submitted for Review');
create table public.quotation_review_events (
 id uuid primary key default gen_random_uuid(), version_id uuid not null, project_id uuid not null,
 actor_id uuid not null references public.profiles(id), action text not null check(action in ('Submitted for Review','Approved','Returned for Revision')),
 remarks text not null check(length(remarks)<=2000), occurred_at timestamptz not null,
 foreign key(version_id,project_id) references public.quotation_versions(id,project_id), unique(version_id,action)
);
create index quotation_review_project on public.quotation_review_events(project_id,occurred_at desc);
create index quotation_review_actor on public.quotation_review_events(actor_id);
create trigger quotation_review_immutable before update or delete on public.quotation_review_events for each row execute function private.reject_audit_mutation();
alter table public.quotation_review_events enable row level security;
revoke all on public.quotation_review_events from public,anon,authenticated;
grant select on public.quotation_review_events to authenticated;
create policy quotation_review_read on public.quotation_review_events for select to authenticated using(exists(select 1 from public.quotation_versions v where v.id=version_id) and (private.current_role()<>'bdm' or action='Approved'));
-- BDM receives approved snapshot contents, never raw removed/cancelled draft items.
drop policy quotation_item_read on public.quotation_items;
create policy quotation_item_read on public.quotation_items for select to authenticated using(private.current_role()<>'bdm' and exists(select 1 from public.quotation_versions v where v.id=version_id));

create function private.protect_quotation_version() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_OP='INSERT' then
  if new.state<>'Draft' or new.snapshot is not null or new.submitted_at is not null or new.reviewed_at is not null then raise exception 'HISTORY_IMMUTABLE'; end if;
  return new;
 end if;
 if (new.id,new.quotation_id,new.project_id,new.number,new.currency,new.created_by,new.created_at,new.source_version_id) is distinct from (old.id,old.quotation_id,old.project_id,old.number,old.currency,old.created_by,old.created_at,old.source_version_id) then raise exception 'HISTORY_IMMUTABLE'; end if;
 if old.state='Draft' then
  if new.state not in ('Draft','Submitted for Review') or new.reviewed_at is not null or new.reviewed_by is not null or new.review_remarks is not null then raise exception 'HISTORY_IMMUTABLE'; end if;
  if new.edit_version<>old.edit_version+1 then raise exception 'VERSION_CONFLICT'; end if;
 elsif old.state='Submitted for Review' then
  if new.state not in ('Approved','Returned for Revision') or new.reviewed_at is null or new.reviewed_by is null or new.review_remarks is null or (new.state='Returned for Revision' and length(trim(new.review_remarks))=0)
   or (to_jsonb(new)-array['state','reviewed_at','reviewed_by','review_remarks','edit_version']) is distinct from (to_jsonb(old)-array['state','reviewed_at','reviewed_by','review_remarks','edit_version']) then raise exception 'HISTORY_IMMUTABLE'; end if;
  if new.edit_version<>old.edit_version+1 then raise exception 'VERSION_CONFLICT'; end if;
 else raise exception 'HISTORY_IMMUTABLE'; end if;
 return new;
end; $$;
revoke all on function private.protect_quotation_version() from public,anon,authenticated;
create trigger quotation_version_guard before insert or update or delete on public.quotation_versions for each row execute function private.protect_quotation_version();
create or replace function private.protect_quotation_item() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_OP='UPDATE' and (new.id,new.version_id,new.project_id,new.space_id,new.lineage_id) is distinct from (old.id,old.version_id,old.project_id,old.space_id,old.lineage_id) then raise exception 'HISTORY_IMMUTABLE'; end if;
 if not exists(select 1 from public.quotation_versions where id=new.version_id and state='Draft') then raise exception 'HISTORY_IMMUTABLE'; end if;
 if exists(select 1 from public.spaces where id=new.space_id and cancelled_at is not null) or exists(select 1 from public.projects where id=new.project_id and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 return new;
end; $$;
create or replace function private.quotation_space_snapshot(p_version uuid,p_space uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'lineage_id',lineage_id,'description',description,'quantity',quantity::text,'unit_price',unit_price::text,'line_amount',line_amount::text,'display_order',display_order) order by display_order),'[]'::jsonb) from public.quotation_items where version_id=p_version and space_id=p_space and removed_at is null
$$;

-- Snapshot builder is private and never accepts client totals or names.
create function private.build_quotation_submission(p_version uuid,p_at timestamptz,p_actor uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('id',v.id,'project_id',v.project_id,'project_name',p.name,'project_reference',p.reference,'number',v.number,'currency',v.currency,'created_by',v.created_by,'created_at',v.created_at,'submitted_by',p_actor,'submitted_at',p_at,
 'total',coalesce((select sum(i.line_amount) from public.quotation_items i join public.spaces s on s.id=i.space_id where i.version_id=v.id and i.removed_at is null and s.cancelled_at is null),0)::text,
 'spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'cancelled',false,'editable',false,'items',private.quotation_space_snapshot(v.id,s.id),'subtotal',coalesce((select sum(i.line_amount) from public.quotation_items i where i.version_id=v.id and i.space_id=s.id and i.removed_at is null),0)::text) order by s.created_at,s.id) from public.spaces s where s.project_id=v.project_id and s.cancelled_at is null),'[]'::jsonb))
 from public.quotation_versions v join public.projects p on p.id=v.project_id where v.id=p_version
$$;
revoke all on function private.build_quotation_submission(uuid,timestamptz,uuid) from public,anon,authenticated;

-- Read either an editable live Draft or its immutable submission; never rebuild locked history.
create function private.get_quotation_version(p_project uuid,p_version uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.quotation_versions; result jsonb; cancelled boolean;
begin
 select * into v from public.quotation_versions where id=p_version and project_id=p_project;
 if not found or not private.quotation_reader(p_project,v.state) then raise exception 'ACCESS_DENIED'; end if;
 select is_cancelled into cancelled from public.projects where id=p_project;
 if v.state='Draft' then
  select jsonb_build_object('id',v.id,'project_id',p_project,'number',v.number,'currency',v.currency,'created_by',v.created_by,'created_at',v.created_at,
   'total',coalesce((select sum(i.line_amount) from public.quotation_items i join public.spaces s on s.id=i.space_id where i.version_id=v.id and i.removed_at is null and s.cancelled_at is null),0)::text,
   'spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'cancelled',s.cancelled_at is not null,'editable',not cancelled and s.cancelled_at is null and coalesce(private.space_editor(s.id),false),'items',private.quotation_space_snapshot(v.id,s.id),'subtotal',case when s.cancelled_at is not null then '0' else coalesce((select sum(i.line_amount) from public.quotation_items i where i.version_id=v.id and i.space_id=s.id and i.removed_at is null),0)::text end) order by s.created_at,s.id) from public.spaces s where s.project_id=p_project),'[]'::jsonb)) into result;
 else result:=v.snapshot;
 end if;
 return result||jsonb_build_object('state',v.state,'edit_version',v.edit_version,'source_version_id',case when private.current_role()='bdm' then null else v.source_version_id end,'submitted_at',v.submitted_at,'submitted_by',v.submitted_by,'reviewed_at',v.reviewed_at,'reviewed_by',v.reviewed_by,'review_remarks',v.review_remarks,
 'can_submit',v.state='Draft' and not cancelled and private.current_role() in ('designer','lead_designer','system_administrator') and (v.created_by=auth.uid() or private.space_manager(p_project)),
 'can_review',v.state='Submitted for Review' and not cancelled and private.space_manager(p_project),
 'can_create_draft',not cancelled and private.current_role() in ('designer','lead_designer','system_administrator') and not exists(select 1 from public.quotation_versions w where w.project_id=p_project and w.state in ('Draft','Submitted for Review')),
 'history',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'actor_id',e.actor_id,'action',e.action,'remarks',e.remarks,'occurred_at',e.occurred_at) order by e.occurred_at,e.id) from public.quotation_review_events e where e.version_id=v.id and (private.current_role()<>'bdm' or e.action='Approved')),'[]'::jsonb));
end; $$;
revoke all on function private.get_quotation_version(uuid,uuid) from public,anon,authenticated;
create or replace function private.get_project_quotation(p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v uuid;
begin
 if not private.quotation_reader(p_project,'Approved') then raise exception 'ACCESS_DENIED'; end if;
 select id into v from public.quotation_versions where project_id=p_project and private.quotation_reader(project_id,state) order by (state='Draft') desc,number desc limit 1;
 if v is null then return null; end if;
 return private.get_quotation_version(p_project,v);
end; $$;
create function private.list_quotation_versions(p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
 if not private.quotation_reader(p_project,'Approved') then raise exception 'ACCESS_DENIED'; end if;
 return coalesce((select jsonb_agg(jsonb_build_object('id',v.id,'number',v.number,'state',v.state,'created_by',v.created_by,'created_at',v.created_at,'submitted_at',v.submitted_at,'reviewed_at',v.reviewed_at,'reviewed_by',v.reviewed_by) order by v.number desc) from public.quotation_versions v where v.project_id=p_project and private.quotation_reader(project_id,state)),'[]'::jsonb);
end; $$;
revoke all on function private.list_quotation_versions(uuid) from public,anon,authenticated;

create or replace function private.create_quotation_draft(p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare q uuid; v uuid; source public.quotation_versions; next_number integer; s jsonb; item jsonb;
begin
 perform private.require_role(array['designer','lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.can_read_pipeline(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.projects where id=p_project and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 select id into q from public.quotations where project_id=p_project;
 if q is null then
  insert into public.quotations(project_id,created_by) values(p_project,auth.uid()) returning id into q;
  next_number:=1;
 else
  select id into v from public.quotation_versions where quotation_id=q and state='Draft';
  if v is not null then return v; end if;
  if exists(select 1 from public.quotation_versions where quotation_id=q and state='Submitted for Review') then raise exception 'QUOTATION_PENDING_REVIEW'; end if;
  select * into source from public.quotation_versions where quotation_id=q order by number desc limit 1;
  if source.state<>'Returned for Revision' then
   select * into source from public.quotation_versions where quotation_id=q and state='Approved' order by number desc limit 1;
  end if;
  if source.id is null or source.snapshot is null then raise exception 'DRAFT_UNAVAILABLE'; end if;
  select max(number)+1 into next_number from public.quotation_versions where quotation_id=q;
 end if;
 insert into public.quotation_versions(quotation_id,project_id,number,created_by,source_version_id) values(q,p_project,next_number,auth.uid(),source.id) returning id into v;
 if source.id is not null then
  for s in select value from jsonb_array_elements(source.snapshot->'spaces') loop
   -- Cancelled Spaces retain source history but cannot receive new draft items.
   if exists(select 1 from public.spaces where id=(s->>'id')::uuid and project_id=p_project and cancelled_at is null) then
    for item in select value from jsonb_array_elements(s->'items') loop
     insert into public.quotation_items(id,version_id,project_id,space_id,lineage_id,description,quantity,unit_price,display_order,created_by,updated_by)
      values(gen_random_uuid(),v,p_project,(s->>'id')::uuid,(item->>'lineage_id')::uuid,item->>'description',(item->>'quantity')::numeric,(item->>'unit_price')::numeric,(item->>'display_order')::integer,auth.uid(),auth.uid());
    end loop;
   end if;
  end loop;
 end if;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'quotation',v,'draft_created',jsonb_build_object('currency','PHP','version',next_number,'source_version_id',source.id,'cancelled_spaces_excluded',true));
 return v;
end; $$;

create function private.submit_quotation(p_version uuid,p_expected_version integer,p_remarks text) returns void language plpgsql security definer set search_path='' as $$
declare v public.quotation_versions; p uuid; stamp timestamptz; frozen jsonb; r public.app_role;
begin
 r:=private.require_role(array['designer','lead_designer','system_administrator']::public.app_role[]);
 select project_id into p from public.quotation_versions where id=p_version;
 perform 1 from public.projects where id=p for update;
 if not found or not private.can_read_pipeline(p) then raise exception 'ACCESS_DENIED'; end if;
 select * into v from public.quotation_versions where id=p_version for update;
 if v.created_by<>auth.uid() and not private.space_manager(p) then raise exception 'ACCESS_DENIED'; end if;
 if p_expected_version is null or p_expected_version<>v.edit_version then raise exception 'VERSION_CONFLICT'; end if;
 if v.state<>'Draft' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if exists(select 1 from public.projects where id=p and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 if p_remarks is null or length(p_remarks)>2000 then raise exception 'INVALID_REMARKS'; end if;
 if r='system_administrator' and length(trim(p_remarks))=0 then raise exception 'ADMIN_REASON_REQUIRED'; end if;
 stamp:=clock_timestamp();
 frozen:=private.build_quotation_submission(p_version,stamp,auth.uid());
 update public.quotation_versions set state='Submitted for Review',snapshot=frozen,submitted_at=stamp,submitted_by=auth.uid(),edit_version=edit_version+1 where id=p_version;
 insert into public.quotation_review_events(version_id,project_id,actor_id,action,remarks,occurred_at) values(p_version,p,auth.uid(),'Submitted for Review',trim(p_remarks),stamp);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p,'quotation',p_version,'quotation.submitted',jsonb_build_object('state','Draft'),jsonb_build_object('state','Submitted for Review','total',frozen->>'total','remarks',trim(p_remarks)));
end; $$;
revoke all on function private.submit_quotation(uuid,integer,text) from public,anon,authenticated;
create function private.review_quotation(p_version uuid,p_expected_version integer,p_decision text,p_remarks text) returns void language plpgsql security definer set search_path='' as $$
declare v public.quotation_versions; p uuid; stamp timestamptz; r public.app_role;
begin
 r:=private.require_role(array['lead_designer','system_administrator']::public.app_role[]);
 select project_id into p from public.quotation_versions where id=p_version;
 perform 1 from public.projects where id=p for update;
 if not found or not private.can_read_pipeline(p) or not private.space_manager(p) then raise exception 'ACCESS_DENIED'; end if;
 select * into v from public.quotation_versions where id=p_version for update;
 if p_expected_version is null or p_expected_version<>v.edit_version then raise exception 'VERSION_CONFLICT'; end if;
 if v.state<>'Submitted for Review' then raise exception 'QUOTATION_NOT_SUBMITTED'; end if;
 if exists(select 1 from public.projects where id=p and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 if p_decision is null or p_decision not in ('Approved','Returned for Revision') then raise exception 'INVALID_DECISION'; end if;
 if p_remarks is null or length(p_remarks)>2000 then raise exception 'INVALID_REMARKS'; end if;
 if p_decision='Returned for Revision' and length(trim(p_remarks))=0 then raise exception 'REMARKS_REQUIRED'; end if;
 if r='system_administrator' and length(trim(p_remarks))=0 then raise exception 'ADMIN_REASON_REQUIRED'; end if;
 stamp:=clock_timestamp();
 update public.quotation_versions set state=p_decision,reviewed_at=stamp,reviewed_by=auth.uid(),review_remarks=trim(p_remarks),edit_version=edit_version+1 where id=p_version;
 insert into public.quotation_review_events(version_id,project_id,actor_id,action,remarks,occurred_at) values(p_version,p,auth.uid(),p_decision,trim(p_remarks),stamp);
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p,'quotation',p_version,'quotation.reviewed',jsonb_build_object('state','Submitted for Review'),jsonb_build_object('state',p_decision,'remarks',trim(p_remarks),'reviewer',auth.uid(),'administrative_override',r='system_administrator'));
end; $$;
revoke all on function private.review_quotation(uuid,integer,text,text) from public,anon,authenticated;

create function public.get_quotation_version(p_project uuid,p_version uuid) returns jsonb language sql security invoker set search_path='' as $$select private.get_quotation_version(p_project,p_version)$$;
create function public.list_quotation_versions(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$select private.list_quotation_versions(p_project)$$;
create function public.submit_quotation(p_version uuid,p_expected_version integer,p_remarks text) returns void language sql security invoker set search_path='' as $$select private.submit_quotation(p_version,p_expected_version,p_remarks)$$;
create function public.review_quotation(p_version uuid,p_expected_version integer,p_decision text,p_remarks text) returns void language sql security invoker set search_path='' as $$select private.review_quotation(p_version,p_expected_version,p_decision,p_remarks)$$;
revoke all on function public.get_quotation_version(uuid,uuid),public.list_quotation_versions(uuid),public.submit_quotation(uuid,integer,text),public.review_quotation(uuid,integer,text,text) from public,anon,authenticated;
grant execute on function public.get_quotation_version(uuid,uuid),public.list_quotation_versions(uuid),public.submit_quotation(uuid,integer,text),public.review_quotation(uuid,integer,text,text),private.get_quotation_version(uuid,uuid),private.list_quotation_versions(uuid),private.submit_quotation(uuid,integer,text),private.review_quotation(uuid,integer,text,text) to authenticated;
