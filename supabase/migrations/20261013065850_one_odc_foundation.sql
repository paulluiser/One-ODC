-- Phase 0: deliberately read-only application baseline. Review on staging before use.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;
create type public.app_role as enum ('system_administrator', 'lead_designer', 'designer', 'bdm', 'operations_admin');
create type public.commercial_status as enum ('For Quotation', 'Negotiation', 'Closed');
create table public.profiles (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null check (length(trim(display_name)) > 0),
  role public.app_role not null default 'designer',
  active boolean not null default false,
  created_at timestamptz not null default now()
);
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique,
  name text not null check (length(trim(name)) > 0),
  lead_designer_id uuid not null references public.profiles(id),
  commercial_status public.commercial_status not null default 'For Quotation',
  expected_handoff date,
  created_at timestamptz not null default now()
);
-- Contains pipeline-safe fields only. Sensitive operational/commercial records belong
-- in separate protected tables in subsequent migrations, never this preview record.
create table public.project_memberships (
  project_id uuid not null references public.projects(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  membership_role public.app_role not null,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  primary key (project_id, user_id, membership_role)
);
create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  project_id uuid references public.projects(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  previous_value jsonb,
  new_value jsonb,
  occurred_at timestamptz not null default now()
);
create index projects_lead_idx on public.projects(lead_designer_id);
create index memberships_user_idx on public.project_memberships(user_id, project_id);
create index audit_project_time_idx on public.audit_events(project_id, occurred_at desc);

create function private.current_role() returns public.app_role
language sql stable security definer set search_path = ''
as $$ select role from public.profiles where id = (select auth.uid()) and active $$;
create function private.can_read_pipeline(target_project uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select private.current_role() is not null and (
    private.current_role() = 'system_administrator'
    or exists (select 1 from public.projects p where p.id = target_project and p.lead_designer_id = (select auth.uid()))
    or exists (select 1 from public.project_memberships m where m.project_id = target_project and m.user_id = (select auth.uid()))
  )
$$;
revoke all on function private.current_role() from public;
revoke all on function private.can_read_pipeline(uuid) from public;
grant execute on function private.current_role() to authenticated;
grant execute on function private.can_read_pipeline(uuid) to authenticated;

alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_memberships enable row level security;
alter table public.audit_events enable row level security;
revoke all on public.profiles, public.projects, public.project_memberships, public.audit_events from anon, authenticated;
grant select on public.profiles, public.projects, public.project_memberships, public.audit_events to authenticated;
create policy profile_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or private.current_role() = 'system_administrator');
create policy project_pipeline_read on public.projects for select to authenticated
  using (private.can_read_pipeline(id));
create policy membership_read on public.project_memberships for select to authenticated
  using (private.current_role() is not null and (user_id = (select auth.uid()) or private.current_role() = 'system_administrator'
    or exists (select 1 from public.projects p where p.id = project_id and p.lead_designer_id = (select auth.uid()))));
create policy audit_admin_read on public.audit_events for select to authenticated
  using (private.current_role() = 'system_administrator');
-- No authenticated write policies. Application mutations require transactional,
-- audited RPCs and field-specific role checks, to be added in Phase 1 onward.

create function private.provision_inactive_profile() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data->>'full_name'), ''), 'Team member'));
  return new;
end; $$;
revoke all on function private.provision_inactive_profile() from public;
create trigger provision_inactive_profile after insert on auth.users
for each row execute function private.provision_inactive_profile();

create function private.reject_audit_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin raise exception 'Audit events are append-only'; end; $$;
revoke all on function private.reject_audit_mutation() from public;
create trigger immutable_audit_events before update or delete on public.audit_events
for each row execute function private.reject_audit_mutation();
commit;
