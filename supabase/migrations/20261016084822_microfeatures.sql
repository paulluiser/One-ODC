-- Additive productivity data. Existing business tables/calculations remain unchanged.
create table public.project_shortcuts (
 user_id uuid not null references public.profiles(id), project_id uuid not null references public.projects(id),
 favorite boolean not null default false, viewed_at timestamptz not null default now(), primary key(user_id,project_id)
);
alter table public.project_shortcuts enable row level security;
grant select on public.project_shortcuts to authenticated;
create policy shortcut_read on public.project_shortcuts for select to authenticated using(user_id=(select auth.uid()) and private.can_read_pipeline(project_id));
create function private.remember_project(p_project uuid,p_favorite boolean default null) returns void language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.can_read_pipeline(p_project),false) then raise exception 'ACCESS_DENIED';end if;
 perform 1 from public.profiles where id=auth.uid() for update;
 if p_favorite=true and (select count(*) from public.project_shortcuts where user_id=auth.uid() and favorite)>=100 and not exists(select 1 from public.project_shortcuts where user_id=auth.uid() and project_id=p_project and favorite) then raise exception 'FAVORITES_LIMIT';end if;
 insert into public.project_shortcuts(user_id,project_id,favorite) values(auth.uid(),p_project,coalesce(p_favorite,false))
 on conflict(user_id,project_id) do update set favorite=coalesce(p_favorite,project_shortcuts.favorite),viewed_at=case when p_favorite is null then now() else project_shortcuts.viewed_at end;
 delete from public.project_shortcuts where user_id=auth.uid() and not favorite and project_id not in(select project_id from public.project_shortcuts where user_id=auth.uid() order by viewed_at desc,project_id limit 30);
end;$$;
create function public.remember_project(p_project uuid,p_favorite boolean default null) returns void language sql security invoker set search_path='' as $$select private.remember_project(p_project,p_favorite)$$;

create function private.can_manage_template_source(p_project uuid) returns boolean language sql stable security definer set search_path='' as $$select coalesce(private.space_manager(p_project) and private.can_read_spaces(p_project),false)$$;
revoke all on function private.can_manage_template_source(uuid) from public,anon;
grant execute on function private.can_manage_template_source(uuid) to authenticated;
create table public.space_structure_templates (
 id uuid primary key,owner_id uuid not null references public.profiles(id),source_project uuid not null references public.projects(id),
 name text not null check(length(btrim(name)) between 1 and 120),structure jsonb not null,created_at timestamptz not null default now()
);
alter table public.space_structure_templates enable row level security;
grant select on public.space_structure_templates to authenticated;
create policy template_read on public.space_structure_templates for select to authenticated using(owner_id=(select auth.uid()) and private.can_manage_template_source(source_project));
create table public.space_template_applications (
 id uuid primary key,template_id uuid not null references public.space_structure_templates(id),project_id uuid not null references public.projects(id),actor_id uuid not null references public.profiles(id),space_count integer not null,created_at timestamptz not null default now()
);
alter table public.space_template_applications enable row level security;
grant select on public.space_template_applications to authenticated;
create policy template_application_read on public.space_template_applications for select to authenticated using(private.can_read_spaces(project_id));
create trigger template_application_immutable before update or delete on public.space_template_applications for each row execute function private.reject_audit_mutation();
create function private.save_space_template(p_id uuid,p_source uuid,p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare payload jsonb;
begin
 if not coalesce(private.space_manager(p_source) and private.can_read_spaces(p_source),false) then raise exception 'ACCESS_DENIED';end if;
 if length(btrim(coalesce(p_name,''))) not between 1 and 120 or p_id is null then raise exception 'VALIDATION_ERROR';end if;
 perform 1 from public.projects where id=p_source for update;
 if exists(select 1 from public.space_structure_templates where id=p_id and owner_id=auth.uid() and source_project=p_source and name=btrim(p_name)) then return p_id;end if;
 if (select count(*) from public.space_structure_templates where owner_id=auth.uid())>=50 then raise exception 'TEMPLATE_LIMIT';end if;
 select jsonb_agg(jsonb_build_object('name',name) order by created_at,id) into payload from public.spaces where project_id=p_source and cancelled_at is null;
 if payload is null or jsonb_array_length(payload)>100 then raise exception 'INVALID_SPACE_SCOPE';end if;
 insert into public.space_structure_templates values(p_id,auth.uid(),p_source,btrim(p_name),payload,now());
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_source,'space_template',p_id,'template.saved',jsonb_build_object('name',btrim(p_name),'count',jsonb_array_length(payload)));
 return p_id;
end;$$;
create function public.save_space_template(p_id uuid,p_source uuid,p_name text) returns uuid language sql security invoker set search_path='' as $$select private.save_space_template(p_id,p_source,p_name)$$;
create function private.apply_space_template(p_operation uuid,p_template uuid,p_project uuid,p_primary uuid,p_confirm boolean) returns integer language plpgsql security definer set search_path='' as $$
declare t public.space_structure_templates; a public.space_template_applications; item jsonb; total integer;
begin
 if not coalesce(private.space_manager(p_project) and private.can_read_spaces(p_project),false) then raise exception 'ACCESS_DENIED';end if;
 perform 1 from public.projects where id=p_project for update;
 select * into a from public.space_template_applications where id=p_operation;
 if found then if a.project_id<>p_project or a.template_id<>p_template or a.actor_id<>auth.uid() then raise exception 'VERSION_CONFLICT';end if;return a.space_count;end if;
 select * into t from public.space_structure_templates where id=p_template and owner_id=auth.uid();
 if not found or not coalesce(private.space_manager(t.source_project) and private.can_read_spaces(t.source_project),false) then raise exception 'ACCESS_DENIED';end if;
 if p_confirm is distinct from true or p_operation is null then raise exception 'CONFIRMATION_REQUIRED';end if;
 perform private.validate_space_assignees(p_project,p_primary,'{}'::uuid[]);
 total:=jsonb_array_length(t.structure);
 for item in select * from jsonb_array_elements(t.structure) loop
  perform private.save_space(gen_random_uuid(),p_project,0,item->>'name',null,p_primary,'{}'::uuid[],'Applied Space structure template: '||t.name);
 end loop;
 insert into public.space_template_applications values(p_operation,p_template,p_project,auth.uid(),total,now());
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,new_value) values(auth.uid(),p_project,'space_template',p_template,'template.applied',jsonb_build_object('operation',p_operation,'count',total,'name',t.name));
 return total;
end;$$;
create function public.apply_space_template(p_operation uuid,p_template uuid,p_project uuid,p_primary uuid,p_confirm boolean) returns integer language sql security invoker set search_path='' as $$select private.apply_space_template(p_operation,p_template,p_project,p_primary,p_confirm)$$;

create table public.project_comments (
 id uuid primary key,project_id uuid not null references public.projects(id),space_id uuid references public.spaces(id),author_id uuid not null references public.profiles(id),
 body text not null check(length(btrim(body)) between 1 and 8000),version integer not null default 1,created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index project_comments_page on public.project_comments(project_id,created_at desc,id);
alter table public.project_comments enable row level security;
grant select on public.project_comments to authenticated;
create policy comment_read on public.project_comments for select to authenticated using(private.can_read_spaces(project_id));
create table public.comment_mentions(comment_id uuid not null references public.project_comments(id),recipient_id uuid not null references public.profiles(id),primary key(comment_id,recipient_id));
alter table public.comment_mentions enable row level security;
grant select on public.comment_mentions to authenticated;
create policy mention_read on public.comment_mentions for select to authenticated using(exists(select 1 from public.project_comments where id=comment_id));
create function private.comment_people(p_project uuid) returns table(id uuid,display_name text) language sql stable security definer set search_path='' as $$
 select p.id,p.display_name from public.profiles p join public.projects j on j.id=p_project
 where private.can_read_spaces(p_project) and p.active and (p.id=j.lead_designer_id or exists(select 1 from public.project_memberships m where m.project_id=j.id and m.user_id=p.id)) and (p.role<>'operations_admin' or j.commercial_status='Closed') order by p.display_name,p.id limit 100
$$;
create function public.comment_people(p_project uuid) returns table(id uuid,display_name text) language sql security invoker set search_path='' as $$select * from private.comment_people(p_project)$$;
create function private.save_project_comment(p_id uuid,p_project uuid,p_space uuid,p_version integer,p_body text,p_mentions uuid[],p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
declare old public.project_comments; prior jsonb; previous_mentions uuid[]; target uuid;
begin
 if not coalesce(private.can_read_spaces(p_project),false) then raise exception 'ACCESS_DENIED';end if;
 if p_id is null or length(btrim(coalesce(p_body,''))) not between 1 and 8000 or p_mentions is null or cardinality(p_mentions)>20 or array_position(p_mentions,null) is not null then raise exception 'VALIDATION_ERROR';end if;
 perform 1 from public.projects where id=p_project for update;
 if p_space is not null and not exists(select 1 from public.spaces where id=p_space and project_id=p_project) then raise exception 'ACCESS_DENIED';end if;
 for target in select distinct unnest(p_mentions) loop
  if not exists(select 1 from private.comment_people(p_project) p where p.id=target) then raise exception 'INVALID_MENTION';end if;
 end loop;
 select * into old from public.project_comments where id=p_id for update;
 if found then
  if old.project_id<>p_project or old.space_id is distinct from p_space or (old.author_id<>auth.uid() and private.current_role()<>'system_administrator') then raise exception 'ACCESS_DENIED';end if;
  if old.version is distinct from p_version then raise exception 'VERSION_CONFLICT';end if;
  if length(btrim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED';end if;
  prior:=to_jsonb(old);
  update public.project_comments set body=btrim(p_body),version=version+1,updated_at=now() where id=p_id;
 else
  if p_version is distinct from 0 then raise exception 'VERSION_CONFLICT';end if;
  if (select count(*) from public.project_comments where author_id=auth.uid() and created_at>now()-interval '1 minute')>=20 then raise exception 'COMMENT_RATE_LIMIT';end if;
  insert into public.project_comments(id,project_id,space_id,author_id,body) values(p_id,p_project,p_space,auth.uid(),btrim(p_body));
 end if;
 select coalesce(array_agg(recipient_id),'{}'::uuid[]) into previous_mentions from public.comment_mentions where comment_id=p_id;
 delete from public.comment_mentions where comment_id=p_id;
 insert into public.comment_mentions select p_id,x from (select distinct unnest(p_mentions) x) u;
 insert into public.notifications(recipient_id,project_id,message) select x,p_project,'You were mentioned in a project discussion.' from (select distinct unnest(p_mentions) x) u where x<>auth.uid() and not(x=any(previous_mentions));
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) select auth.uid(),p_project,'project_comment',p_id,case when prior is null then 'comment.created' else 'comment.corrected' end,prior,to_jsonb(c)||jsonb_build_object('mentions',p_mentions,'reason',p_reason) from public.project_comments c where c.id=p_id;
 return p_id;
end;$$;
create function public.save_project_comment(p_id uuid,p_project uuid,p_space uuid,p_version integer,p_body text,p_mentions uuid[],p_reason text default '') returns uuid language sql security invoker set search_path='' as $$select private.save_project_comment(p_id,p_project,p_space,p_version,p_body,p_mentions,p_reason)$$;

-- Explicit privileges on every new RPC; no anonymous or direct-table writes.
revoke all on public.project_shortcuts,public.space_structure_templates,public.space_template_applications,public.project_comments,public.comment_mentions from anon,authenticated;
grant select on public.project_shortcuts,public.space_structure_templates,public.space_template_applications,public.project_comments,public.comment_mentions to authenticated;
revoke all on function private.remember_project(uuid,boolean),public.remember_project(uuid,boolean),private.save_space_template(uuid,uuid,text),public.save_space_template(uuid,uuid,text),private.apply_space_template(uuid,uuid,uuid,uuid,boolean),public.apply_space_template(uuid,uuid,uuid,uuid,boolean),private.comment_people(uuid),public.comment_people(uuid),private.save_project_comment(uuid,uuid,uuid,integer,text,uuid[],text),public.save_project_comment(uuid,uuid,uuid,integer,text,uuid[],text) from public,anon;
grant execute on function private.remember_project(uuid,boolean),public.remember_project(uuid,boolean),private.save_space_template(uuid,uuid,text),public.save_space_template(uuid,uuid,text),private.apply_space_template(uuid,uuid,uuid,uuid,boolean),public.apply_space_template(uuid,uuid,uuid,uuid,boolean),private.comment_people(uuid),public.comment_people(uuid),private.save_project_comment(uuid,uuid,uuid,integer,text,uuid[],text),public.save_project_comment(uuid,uuid,uuid,integer,text,uuid[],text) to authenticated;

create index shortcut_project_fk on public.project_shortcuts(project_id);
create index template_owner_fk on public.space_structure_templates(owner_id);
create index template_source_fk on public.space_structure_templates(source_project);
create index template_application_template_fk on public.space_template_applications(template_id);
create index template_application_project_fk on public.space_template_applications(project_id);
create index template_application_actor_fk on public.space_template_applications(actor_id);
create index comment_space_fk on public.project_comments(space_id);
create index comment_author_fk on public.project_comments(author_id);
create index comment_recipient_fk on public.comment_mentions(recipient_id);
