-- Comment edits retain version checks and full audit snapshots; a reason is optional.
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
  if length(coalesce(p_reason,''))>2000 then raise exception 'VALIDATION_ERROR';end if;
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
