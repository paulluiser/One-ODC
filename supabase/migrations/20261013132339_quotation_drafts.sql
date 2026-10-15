-- Draft pricing only. Approval/submission endpoints deliberately belong to Phase 3B.
create unique index spaces_project_identity on public.spaces(id,project_id);
create table public.quotations (
 id uuid primary key default gen_random_uuid(), project_id uuid not null unique references public.projects(id),
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(), unique(id,project_id)
);
create table public.quotation_versions (
 id uuid primary key default gen_random_uuid(), quotation_id uuid not null, project_id uuid not null,
 number integer not null check(number>0), state text not null default 'Draft' check(length(state) between 1 and 40),
 currency text not null default 'PHP' check(currency='PHP'), edit_version integer not null default 1,
 created_by uuid not null references public.profiles(id), created_at timestamptz not null default now(),
 foreign key(quotation_id,project_id) references public.quotations(id,project_id), unique(quotation_id,number), unique(id,project_id)
);
create unique index quotation_current_draft on public.quotation_versions(quotation_id) where state='Draft';
create index quotation_versions_project on public.quotation_versions(project_id);
create index quotation_versions_actor on public.quotation_versions(created_by);
create index quotations_actor on public.quotations(created_by);
create table public.quotation_items (
 id uuid primary key, version_id uuid not null, project_id uuid not null, space_id uuid not null,
 description text not null check(length(trim(description)) between 1 and 2000),
 quantity numeric(12,3) not null check(quantity>=0), unit_price numeric(14,2) not null check(unit_price>=0),
 line_amount numeric(28,2) generated always as (round(quantity*unit_price,2)) stored,
 display_order integer not null check(display_order>0), removed_at timestamptz,
 created_by uuid not null references public.profiles(id), updated_by uuid not null references public.profiles(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(version_id,project_id) references public.quotation_versions(id,project_id),
 foreign key(space_id,project_id) references public.spaces(id,project_id)
);
create unique index quotation_item_order on public.quotation_items(version_id,space_id,display_order) where removed_at is null;
create index quotation_items_project on public.quotation_items(project_id);
create index quotation_items_space on public.quotation_items(space_id);
create index quotation_items_creator on public.quotation_items(created_by);
create index quotation_items_updater on public.quotation_items(updated_by);
create table public.quotation_draft_events (
 id uuid primary key default gen_random_uuid(), project_id uuid not null references public.projects(id),
 version_id uuid not null references public.quotation_versions(id), actor_id uuid not null references public.profiles(id),
 reason text not null, previous_value jsonb, new_value jsonb not null, occurred_at timestamptz not null default now()
);
create index quotation_events_project on public.quotation_draft_events(project_id,occurred_at desc);
create index quotation_events_version on public.quotation_draft_events(version_id);
create index quotation_events_actor on public.quotation_draft_events(actor_id);
create trigger quotation_events_immutable before update or delete on public.quotation_draft_events for each row execute function private.reject_audit_mutation();
create function private.quotation_reader(p_project uuid,p_state text) returns boolean language sql stable security definer set search_path='' as $$
 select private.current_role() is not null and private.current_role()<>'operations_admin' and private.can_read_pipeline(p_project) and (private.current_role()<>'bdm' or p_state='Approved')
$$;
revoke all on function private.quotation_reader(uuid,text) from public,anon;
grant execute on function private.quotation_reader(uuid,text) to authenticated;
alter table public.quotations enable row level security;
alter table public.quotation_versions enable row level security;
alter table public.quotation_items enable row level security;
alter table public.quotation_draft_events enable row level security;
revoke all on public.quotations,public.quotation_versions,public.quotation_items,public.quotation_draft_events from anon,authenticated;
grant select on public.quotations,public.quotation_versions,public.quotation_items,public.quotation_draft_events to authenticated;
create policy quotation_read on public.quotations for select to authenticated using(exists(select 1 from public.quotation_versions v where v.quotation_id=quotations.id));
create policy quotation_version_read on public.quotation_versions for select to authenticated using(private.quotation_reader(project_id,state));
create policy quotation_item_read on public.quotation_items for select to authenticated using(exists(select 1 from public.quotation_versions v where v.id=version_id));
create policy quotation_event_read on public.quotation_draft_events for select to authenticated using(private.quotation_reader(project_id,'Draft'));

-- Guard privileged accidental edits as well as the ungranted client write path.
create function private.protect_quotation_item() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='DELETE' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if TG_OP='UPDATE' and (new.id,new.version_id,new.project_id,new.space_id) is distinct from (old.id,old.version_id,old.project_id,old.space_id) then raise exception 'HISTORY_IMMUTABLE'; end if;
 if not exists(select 1 from public.quotation_versions where id=new.version_id and state='Draft') then raise exception 'HISTORY_IMMUTABLE'; end if;
 if exists(select 1 from public.spaces where id=new.space_id and cancelled_at is not null) or exists(select 1 from public.projects where id=new.project_id and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 return new;
end; $$;
revoke all on function private.protect_quotation_item() from public,anon,authenticated;
create trigger quotation_item_guard before insert or update or delete on public.quotation_items for each row execute function private.protect_quotation_item();
create function private.quotation_space_snapshot(p_version uuid,p_space uuid) returns jsonb language sql stable security definer set search_path='' as $$
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'description',description,'quantity',quantity::text,'unit_price',unit_price::text,'line_amount',line_amount::text,'display_order',display_order) order by display_order),'[]'::jsonb) from public.quotation_items where version_id=p_version and space_id=p_space and removed_at is null
$$;
revoke all on function private.quotation_space_snapshot(uuid,uuid) from public,anon,authenticated;

-- Mutations take the same Project lock as lifecycle/assignment/Space operations.
create function private.create_quotation_draft(p_project uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare q uuid; v uuid;
begin
 perform private.require_role(array['designer','lead_designer','system_administrator']::public.app_role[]);
 perform 1 from public.projects where id=p_project for update;
 if not found or not private.can_read_pipeline(p_project) then raise exception 'ACCESS_DENIED'; end if;
 if exists(select 1 from public.projects where id=p_project and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 select id into q from public.quotations where project_id=p_project;
 if q is not null then
  select id into v from public.quotation_versions where quotation_id=q and state='Draft';
  if v is null then raise exception 'DRAFT_UNAVAILABLE'; end if;
  return v;
 end if;
 insert into public.quotations(project_id,created_by) values(p_project,auth.uid()) returning id into q;
 insert into public.quotation_versions(quotation_id,project_id,number,created_by) values(q,p_project,1,auth.uid()) returning id into v;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'quotation',v,'draft_created',jsonb_build_object('currency','PHP','version',1));
 return v;
end; $$;
revoke all on function private.create_quotation_draft(uuid) from public,anon,authenticated;

create function private.save_quotation_space(p_draft uuid,p_space uuid,p_expected_version integer,p_items jsonb,p_reason text) returns integer language plpgsql security definer set search_path='' as $$
declare p uuid; v public.quotation_versions; item jsonb; before_items jsonb; after_items jsonb; n integer:=0; item_id uuid; selected_ids uuid[]:='{}';
begin
 perform private.require_role(array['designer','lead_designer','system_administrator']::public.app_role[]);
 select project_id into p from public.quotation_versions where id=p_draft;
 perform 1 from public.projects where id=p for update;
 if not found or not private.can_read_pipeline(p) then raise exception 'ACCESS_DENIED'; end if;
 select * into v from public.quotation_versions where id=p_draft for update;
 if v.state<>'Draft' then raise exception 'HISTORY_IMMUTABLE'; end if;
 if p_expected_version is null or v.edit_version<>p_expected_version then raise exception 'VERSION_CONFLICT'; end if;
 if exists(select 1 from public.projects where id=p and is_cancelled) then raise exception 'PROJECT_CANCELLED'; end if;
 if not exists(select 1 from public.spaces where id=p_space and project_id=p and cancelled_at is null) or not coalesce(private.space_editor(p_space),false) then raise exception 'ACCESS_DENIED'; end if;
 if p_reason is null or length(trim(p_reason)) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 if p_items is null or jsonb_typeof(p_items)<>'array' then raise exception 'INVALID_ITEMS'; end if;
 if jsonb_array_length(p_items)>200 then raise exception 'INVALID_ITEMS'; end if;
 for item in select value from jsonb_array_elements(p_items) loop
  if jsonb_typeof(item)<>'object' or jsonb_typeof(item->'id') is distinct from 'string' or jsonb_typeof(item->'description') is distinct from 'string' or jsonb_typeof(item->'quantity') is distinct from 'string' or jsonb_typeof(item->'unit_price') is distinct from 'string'
   or coalesce(item->>'id','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
   or length(trim(item->>'description')) not between 1 and 2000
   or (item->>'quantity') !~ '^(0|[1-9][0-9]{0,8})([.][0-9]{1,3})?$'
   or (item->>'unit_price') !~ '^(0|[1-9][0-9]{0,11})([.][0-9]{1,2})?$' then raise exception 'INVALID_ITEMS'; end if;
  item_id:=(item->>'id')::uuid;
  if item_id=any(selected_ids) then raise exception 'INVALID_ITEMS'; end if;
  selected_ids:=array_append(selected_ids,item_id);
  if exists(select 1 from public.quotation_items where id=item_id and (version_id<>p_draft or space_id<>p_space or removed_at is not null)) then raise exception 'INVALID_ITEMS'; end if;
 end loop;
 if (select count(*) from public.quotation_items where version_id=p_draft and space_id<>p_space and removed_at is null)+jsonb_array_length(p_items)>2000 then raise exception 'INVALID_ITEMS'; end if;
 before_items:=private.quotation_space_snapshot(p_draft,p_space);
 update public.quotation_items set removed_at=now(),updated_at=now(),updated_by=auth.uid() where version_id=p_draft and space_id=p_space and removed_at is null and not(id=any(selected_ids));
 -- Move all retained orders out of the target range before an arbitrary permutation.
 update public.quotation_items set display_order=display_order+1000 where version_id=p_draft and space_id=p_space and removed_at is null;
 for item in select value from jsonb_array_elements(p_items) loop
  n:=n+1;
  insert into public.quotation_items(id,version_id,project_id,space_id,description,quantity,unit_price,display_order,created_by,updated_by)
   values((item->>'id')::uuid,p_draft,p,p_space,trim(item->>'description'),(item->>'quantity')::numeric,(item->>'unit_price')::numeric,n,auth.uid(),auth.uid())
   on conflict(id) do update set description=excluded.description,quantity=excluded.quantity,unit_price=excluded.unit_price,display_order=excluded.display_order,updated_by=auth.uid(),updated_at=now();
 end loop;
 update public.quotation_versions set edit_version=edit_version+1 where id=p_draft returning edit_version into n;
 after_items:=private.quotation_space_snapshot(p_draft,p_space);
 insert into public.quotation_draft_events(project_id,version_id,actor_id,reason,previous_value,new_value) values(p,p_draft,auth.uid(),trim(p_reason),jsonb_build_object('space_id',p_space,'items',before_items),jsonb_build_object('space_id',p_space,'items',after_items,'edit_version',n));
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) values(auth.uid(),p,'quotation',p_draft,'draft_space_saved',jsonb_build_object('space_id',p_space,'items',before_items),jsonb_build_object('space_id',p_space,'items',after_items,'edit_version',n,'reason',trim(p_reason)));
 return n;
end; $$;
revoke all on function private.save_quotation_space(uuid,uuid,integer,jsonb,text) from public,anon,authenticated;

create function private.get_project_quotation(p_project uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare v public.quotation_versions; result jsonb;
begin
 if not private.quotation_reader(p_project,'Approved') then raise exception 'ACCESS_DENIED'; end if;
 select * into v from public.quotation_versions where project_id=p_project and private.quotation_reader(project_id,state) order by (state='Draft') desc,number desc limit 1;
 if not found then return null; end if;
 select jsonb_build_object('id',v.id,'project_id',p_project,'number',v.number,'state',v.state,'edit_version',v.edit_version,'currency',v.currency,
 'total',coalesce((select sum(i.line_amount) from public.quotation_items i join public.spaces s on s.id=i.space_id where i.version_id=v.id and i.removed_at is null and s.cancelled_at is null),0)::text,
 'spaces',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'name',s.name,'cancelled',s.cancelled_at is not null,
 'editable',v.state='Draft' and not p.is_cancelled and s.cancelled_at is null and coalesce(private.space_editor(s.id),false),
 'items',private.quotation_space_snapshot(v.id,s.id),
 'subtotal',case when s.cancelled_at is not null then '0' else coalesce((select sum(i.line_amount) from public.quotation_items i where i.version_id=v.id and i.space_id=s.id and i.removed_at is null),0)::text end) order by s.created_at,s.id)
 from public.spaces s join public.projects p on p.id=s.project_id where s.project_id=p_project),'[]'::jsonb)) into result;
 return result;
end; $$;
revoke all on function private.get_project_quotation(uuid) from public,anon,authenticated;
create function public.create_quotation_draft(p_project uuid) returns uuid language sql security invoker set search_path='' as $$select private.create_quotation_draft(p_project)$$;
create function public.save_quotation_space(p_draft uuid,p_space uuid,p_expected_version integer,p_items jsonb,p_reason text) returns integer language sql security invoker set search_path='' as $$select private.save_quotation_space(p_draft,p_space,p_expected_version,p_items,p_reason)$$;
create function public.get_project_quotation(p_project uuid) returns jsonb language sql security invoker set search_path='' as $$select private.get_project_quotation(p_project)$$;
revoke all on function public.create_quotation_draft(uuid),public.save_quotation_space(uuid,uuid,integer,jsonb,text),public.get_project_quotation(uuid) from public,anon,authenticated;
grant execute on function public.create_quotation_draft(uuid),public.save_quotation_space(uuid,uuid,integer,jsonb,text),public.get_project_quotation(uuid),private.create_quotation_draft(uuid),private.save_quotation_space(uuid,uuid,integer,jsonb,text),private.get_project_quotation(uuid) to authenticated;
