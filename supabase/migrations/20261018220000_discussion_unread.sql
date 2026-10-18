-- Additive discussion read receipts; existing comments and audits remain intact.
create table public.project_comment_reads (
 user_id uuid not null references public.profiles(id),
 comment_id uuid not null references public.project_comments(id),
 read_at timestamptz not null default now(), primary key(user_id,comment_id)
);
alter table public.project_comment_reads enable row level security;
revoke all on public.project_comment_reads from anon,authenticated;
grant select on public.project_comment_reads to authenticated;
create policy own_comment_reads on public.project_comment_reads for select to authenticated
 using(user_id=(select auth.uid()) and exists(select 1 from public.project_comments c where c.id=comment_id));
create index comment_reads_comment_idx on public.project_comment_reads(comment_id);
alter table public.notifications add column type text, add column comment_id uuid references public.project_comments(id), add column space_id uuid references public.spaces(id);
create unique index notification_comment_recipient on public.notifications(recipient_id,comment_id) where type='project_mention';
create index notification_comment_fk on public.notifications(comment_id);
create index notification_space_fk on public.notifications(space_id);
alter policy notification_read on public.notifications using (
 recipient_id=(select auth.uid()) and (select private.current_role()) is not null
 and (type is distinct from 'project_mention' or private.can_read_spaces(project_id))
);
-- Invoker: both comments and receipts independently enforce RLS.
create function public.discussion_unread() returns table(project_id uuid, unread bigint)
 language sql stable security invoker set search_path='' as $$
 select c.project_id,count(*) from public.project_comments c
 where c.author_id<>(select auth.uid()) and not exists(
 select 1 from public.project_comment_reads r where r.user_id=(select auth.uid()) and r.comment_id=c.id)
 group by c.project_id;
$$;
create function private.read_project_comments(p_project uuid,p_comments uuid[]) returns void
 language plpgsql security definer set search_path='' as $$
begin
 if not coalesce(private.can_read_spaces(p_project),false) then raise exception 'ACCESS_DENIED';end if;
 if p_comments is null or cardinality(p_comments)>100 or array_position(p_comments,null) is not null then raise exception 'VALIDATION_ERROR';end if;
 if exists(select 1 from unnest(p_comments) x where not exists(select 1 from public.project_comments c where c.id=x and c.project_id=p_project)) then raise exception 'ACCESS_DENIED';end if;
 insert into public.project_comment_reads(user_id,comment_id)
 select auth.uid(),c.id from public.project_comments c where c.project_id=p_project and c.id=any(p_comments) and c.author_id<>auth.uid()
 on conflict do nothing;
end;$$;
create function public.read_project_comments(p_project uuid,p_comments uuid[]) returns void
 language sql security invoker set search_path='' as $$select private.read_project_comments(p_project,p_comments)$$;
revoke all on function public.discussion_unread(),private.read_project_comments(uuid,uuid[]),public.read_project_comments(uuid,uuid[]) from public,anon;
grant execute on function public.discussion_unread(),private.read_project_comments(uuid,uuid[]),public.read_project_comments(uuid,uuid[]) to authenticated;
create or replace function private.save_project_comment(p_id uuid,p_project uuid,p_space uuid,p_version integer,p_body text,p_mentions uuid[],p_reason text default '') returns uuid language plpgsql security definer set search_path='' as $$
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
  if p_version=0 and old.version=1 and old.author_id=auth.uid() and old.body=btrim(p_body)
     and (select coalesce(array_agg(recipient_id order by recipient_id),'{}'::uuid[]) from public.comment_mentions where comment_id=p_id)
       = (select coalesce(array_agg(x order by x),'{}'::uuid[]) from (select distinct unnest(p_mentions) x) t)
     then return p_id; end if;
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
 insert into public.notifications(recipient_id,project_id,message,type,comment_id,space_id)
 select x,p_project,
   author.display_name||' mentioned you in '||p.name||' ('||p.reference||')'||
   case when s.name is null then '' else ' · '||s.name end||E'\n'||left(btrim(p_body),180),
   'project_mention',p_id,p_space
 from (select distinct unnest(p_mentions) x) u
 join public.projects p on p.id=p_project
 join public.profiles author on author.id=auth.uid()
 left join public.spaces s on s.id=p_space
 where x<>auth.uid() and not(x=any(previous_mentions))
 on conflict (recipient_id,comment_id) where type='project_mention' do nothing;
 insert into public.audit_events(actor_id,project_id,entity_type,entity_id,action,previous_value,new_value) select auth.uid(),p_project,'project_comment',p_id,case when prior is null then 'comment.created' else 'comment.corrected' end,prior,to_jsonb(c)||jsonb_build_object('mentions',p_mentions,'reason',p_reason) from public.project_comments c where c.id=p_id;
 return p_id;
end;$$;
