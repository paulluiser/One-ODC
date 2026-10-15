begin;
alter policy notification_read on public.notifications using (recipient_id=(select auth.uid()) and (select private.current_role()) is not null);
alter policy membership_read on public.project_memberships using (private.can_read_pipeline(project_id) and ((select private.current_role())<>'operations_admin' or user_id=(select auth.uid())));
commit;
