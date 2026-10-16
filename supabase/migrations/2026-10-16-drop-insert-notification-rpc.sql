-- 2026-10-16-drop-insert-notification-rpc.sql
--
-- Cleanup: the public.insert_notification() RPC and the
-- notifications_insert_authenticated policy were created ad-hoc by
-- scripts/check-notifs.cjs in production on 2026-10-15 to work around
-- an RLS issue. The DB trigger public.notify_on_connection() is the
-- single source of truth for connection notifications — it runs as
-- SECURITY DEFINER and bypasses RLS, so no server-side helper RPC is
-- needed. The API routes used to call insert_notification() after
-- every INSERT/UPDATE, which produced TWO notification rows per
-- connection event (one from the trigger, one from the API). That
-- double-notification is what the user reported on 2026-10-16:
--   "thông báo thì hiện ra liền 2 thông báo có người request,
--    bên phía request thì có tận 4 thông báo"
--
-- This migration drops the redundant RPC and the orphan INSERT policy
-- so the bug can't regress via the old ad-hoc path.
--
-- Idempotent — safe to re-run.

DROP FUNCTION IF EXISTS public.insert_notification(
  p_user_id UUID,
  p_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_actor_id UUID,
  p_link TEXT
);

-- The notifications_insert_authenticated policy was added in
-- 2026-10-15-notifications-insert-policy.sql as a workaround. With
-- the trigger being the only writer, the policy is no longer needed
-- and would only widen the RLS surface for future client-side
-- direct inserts. Drop it.
DROP POLICY IF EXISTS notifications_insert_authenticated ON public.notifications;
