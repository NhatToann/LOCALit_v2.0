-- Add INSERT policy for the `authenticated` role so the server-side
-- route handlers (which use the anon key + the user's session cookie)
-- can insert notifications on behalf of any user.
--
-- Without this, PATCH /api/connections/[id] (accept/reject/cancel) and
-- POST /api/connections fail with:
--   "new row violates row-level security policy for table notifications"
-- because Supabase's createClient() server-side helper uses the
-- anon key, which PostgREST interprets as the `authenticated` role
-- when a session cookie is present.
--
-- The check `WITH CHECK (user_id IS NOT NULL)` blocks inserts that
-- forget to specify a recipient (no NULL user_id rows).
-- The bell + /notifications page already SELECT/UPDATE under their
-- own user_id check, so this only widens INSERT.
--
-- The `service_role` policy covers the (future) case where admin code
-- inserts via the service-role key. The `authenticated` policy covers
-- the in-app server-side routes.

CREATE POLICY notifications_insert_authenticated ON public.notifications
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id IS NOT NULL);
