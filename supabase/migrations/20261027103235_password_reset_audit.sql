-- Administrators request email recovery; they never read or choose user passwords.
create function private.record_password_reset_request(p_user uuid,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
begin
 perform private.require_role(array['system_administrator']::public.app_role[]);
 if length(trim(coalesce(p_reason,''))) not between 1 and 2000 then raise exception 'REASON_REQUIRED'; end if;
 perform 1 from public.profiles where id=p_user and active for update;
 if not found then raise exception 'ACTIVE_ACCOUNT_REQUIRED'; end if;
 if exists(select 1 from public.audit_events where entity_id=p_user and action='user.password_reset_requested' and occurred_at>now()-interval '1 minute') then raise exception 'RESET_RATE_LIMIT'; end if;
 insert into public.audit_events(actor_id,entity_type,entity_id,action,new_value)
 values(auth.uid(),'profile',p_user,'user.password_reset_requested',jsonb_build_object('reason',trim(p_reason)));
end $$;
create function public.record_password_reset_request(p_user uuid,p_reason text) returns void
language sql security invoker set search_path='' as $$select private.record_password_reset_request($1,$2)$$;
revoke all on function private.record_password_reset_request(uuid,text),public.record_password_reset_request(uuid,text) from public,anon;
grant execute on function private.record_password_reset_request(uuid,text),public.record_password_reset_request(uuid,text) to authenticated;
