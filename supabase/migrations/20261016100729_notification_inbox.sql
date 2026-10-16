-- Keep recipient-only writes behind the established checked private RPC pattern.
create function private.mark_all_notifications_read() returns integer
language plpgsql security definer set search_path='' as $$
declare affected integer;
begin
 perform private.require_role(enum_range(null::public.app_role));
 update public.notifications set read_at=now()
 where recipient_id=auth.uid() and read_at is null;
 get diagnostics affected = row_count;
 return affected;
end; $$;
create function public.mark_all_notifications_read() returns integer
language sql security invoker set search_path='' as $$
 select private.mark_all_notifications_read();
$$;
revoke all on function private.mark_all_notifications_read(),public.mark_all_notifications_read() from public,anon;
grant execute on function private.mark_all_notifications_read(),public.mark_all_notifications_read() to authenticated;
