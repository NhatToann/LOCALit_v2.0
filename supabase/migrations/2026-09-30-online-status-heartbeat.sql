-- =================================================================
-- 2026-09-30: Online-status heartbeat (Phase 1 of presence rewrite)
-- =================================================================
-- Problem:
--   * profiles.is_online is read by 12+ queries (browse, map, chat,
--     buddy cards, voice-call gating) but is currently never set
--     automatically. John (tourist) logs in → still shows offline;
--     Buddy has a manual toggle but it sticks at "online" after they
--     close the tab.
--   * Without a server-side heartbeat, every consumer is reading stale
--     data from the last write.
--
-- Solution (Phase 1 — heartbeat-driven, user has confirmed):
--   * RPC set_online_status(me, is_online) — SECURITY DEFINER so the
--     client doesn't need broad UPDATE grants on profiles. Sets
--     is_online AND last_seen atomically.
--   * Client-side hook lib/realtime/useOnlineHeartbeat.ts (mounted in
--     AppShell) calls this RPC on mount + every 30 s while visible, and
--     a final false on beforeunload / visibilitychange→hidden (after
--     a 5-min grace window).
--   * pg_cron job every 5 min flips profiles.is_online = false where
--     last_seen < now() - INTERVAL '90 seconds' (defensive: catches
--     closed-tab browsers that couldn't send beforeunload).
--   * buddy/dashboard manual toggle is removed; status is derived.
--
-- Phase 2 (separate migration) will add a Realtime presence channel
-- for sub-second updates and use Realtime state to override DB is_online
-- in chat/voice-call UIs.
-- =================================================================

-- -----------------------------------------------------------------
-- 1. RPC: set_online_status(p_is_online boolean)
-- -----------------------------------------------------------------
-- Caller must be authenticated. We update only the row whose id
-- matches auth.uid(); SECURITY DEFINER means we bypass RLS but the
-- WHERE clause on auth.uid() makes it safe — a user can only flip
-- their own row.
--
-- Returns: the new is_online + last_seen values.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_online_status(p_is_online boolean)
RETURNS TABLE (is_online boolean, last_seen timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  -- Defensive: refuse if no session. (Definer role would let us bypass,
  -- but we still want callers to be the row owner.)
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'set_online_status requires an authenticated session'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.profiles
     SET is_online = p_is_online,
         last_seen = now()
   WHERE id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No profile row for auth.uid()=%', auth.uid()
      USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
    SELECT p.is_online, p.last_seen
    FROM public.profiles p
    WHERE p.id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.set_online_status(boolean) IS
  'Heartbeat endpoint for the client-side online tracker. Updates the caller''s profiles.is_online + last_seen in one shot. SECURITY DEFINER so the client does not need direct UPDATE on profiles.';

-- Allow authenticated callers. Anon denied (no auth.uid()).
REVOKE ALL ON FUNCTION public.set_online_status(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_online_status(boolean) TO authenticated;

-- -----------------------------------------------------------------
-- 2. RPC: mark_stale_users_offline() — defensive cleanup
-- -----------------------------------------------------------------
-- Called by the pg_cron job every 5 minutes. Flips profiles.is_online
-- = false for any row whose last_seen is older than 90 s. Idempotent.
--
-- 90 s = 3× the 30 s heartbeat cadence; gives one missed heartbeat
-- slack without making stale rows linger too long.
-- -----------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_stale_users_offline()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  affected integer;
BEGIN
  UPDATE public.profiles
     SET is_online = false
   WHERE is_online = true
     AND last_seen IS NOT NULL
     AND last_seen < now() - INTERVAL '90 seconds';
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

COMMENT ON FUNCTION public.mark_stale_users_offline() IS
  'pg_cron entrypoint. Flips profiles.is_online=false for rows whose last_seen is older than 90s (3× the 30s heartbeat cadence). Defensive against closed tabs / network drops that prevent beforeunload.';

REVOKE ALL ON FUNCTION public.mark_stale_users_offline() FROM PUBLIC;

-- -----------------------------------------------------------------
-- 3. pg_cron schedule (5-minute cadence)
-- -----------------------------------------------------------------
-- Supabase Cloud has the pg_cron extension pre-installed under the
-- `cron` schema with the `postgres` role as job owner. This block is
-- idempotent: cron.schedule no-ops if a job with the same name exists.
-- -----------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Remove any prior version of the job so re-running this migration is safe.
SELECT cron.unschedule('localit-mark-stale-offline')
  WHERE EXISTS (
    SELECT 1 FROM cron.job WHERE jobname = 'localit-mark-stale-offline'
  );

SELECT cron.schedule(
  'localit-mark-stale-offline',
  '*/5 * * * *',
  $$ SELECT public.mark_stale_users_offline(); $$
);

-- -----------------------------------------------------------------
-- 4. Index on (is_online, last_seen) for fast stale-scan
-- -----------------------------------------------------------------
-- The cron job's UPDATE scans `is_online = true AND last_seen < ...`.
-- With ~9 rows today this is fine, but the partial index future-proofs
-- when the user count grows.
-- -----------------------------------------------------------------
CREATE INDEX IF NOT EXISTS profiles_is_online_last_seen_idx
  ON public.profiles (last_seen)
  WHERE is_online = true;
