-- 2026-10-07: Allow tourists to see other tourists' recent live locations.
--
-- Before this migration, only buddies could SELECT from public.location_updates.
-- The new /map live-sharing UI lets tourists opt in to broadcasting their own
-- position and seeing peer tourists nearby. Each user's row is only visible if
-- it has been refreshed in the last 5 minutes (active re-publish from the
-- useLiveUserLocations watchPosition loop), so historical rows never leak.
--
-- SECURITY: the policy still does NOT expose historical data. Rows older than
-- 5 minutes are filtered out at the row level via the WHERE on updated_at.
-- The hook also enforces client-side eviction at staleAfterMs (default 60s).
--
-- This makes the "share my live location" feature actually work between 2
-- devices, which it didn't before because the broadcast channel silently
-- dropped messages in this project's setup.

DROP POLICY IF EXISTS "Buddies can see other buddy locations for discovery" ON public.location_updates;

CREATE POLICY "Authenticated users see recent live locations"
  ON public.location_updates
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR (
      auth.role() = 'authenticated'
      AND updated_at > (now() - INTERVAL '5 minutes')
    )
  );