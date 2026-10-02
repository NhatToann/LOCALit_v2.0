-- 2026-10-02 fix: profiles.is_online seed-data bug
--
-- Bug: All seed accounts (and any account that was inserted via direct DB
-- writes, bypassing the auth trigger) had `is_online = TRUE` written once
-- at insert time and never reset. The cron job
-- `public.mark_stale_users_offline()` only flips rows whose
-- `last_seen < now() - 90s` — but the 7 never-seen seed accounts had
-- `last_seen = NULL`, so `NULL < now() - 90s` evaluates to NULL, the
-- WHERE clause never matched, and they stayed `is_online = TRUE` forever.
--
-- This caused:
--   - "Buddy is online" labels on profiles the user has never visited
--   - Phone/Video call buttons ENABLED on the chat page for never-seen
--     buddies, then `Cannot call: buddy is offline.` when clicked
--     (the realtime channel was empty)
--   - The /map and /browse "Buddies Available Now" rows that show as
--     available when the buddy isn't actually logged in
--
-- Fix:
--   1. Flip is_online=false for every row where last_seen IS NULL
--      (definitively "never seen"). One-shot UPDATE; safe to re-run.
--   2. Patch mark_stale_users_offline() so its WHERE clause also
--      catches last_seen IS NULL. Going forward, the cron will keep
--      freshly-inserted rows honest too.

-- (1) One-shot cleanup: anyone whose last_seen is NULL is definitely
-- not online. Mark them offline now.
UPDATE public.profiles
SET is_online = FALSE
WHERE last_seen IS NULL
  AND is_online = TRUE;

-- (2) Harden the cron function so future direct-inserted accounts also
-- get marked offline by the cron. Replace the WHERE clause so that
-- ANY row whose last_seen is NULL (never seen) OR older than 90s
-- gets flipped. We also leave a fresh `is_online = TRUE` row alone
-- if its last_seen was just set (defensive against clock skew).
CREATE OR REPLACE FUNCTION public.mark_stale_users_offline()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  affected INTEGER;
BEGIN
  UPDATE public.profiles
  SET is_online = FALSE
  WHERE is_online = TRUE
    AND (
      last_seen IS NULL
      OR last_seen < (now() - INTERVAL '90 seconds')
    );
  GET DIAGNOSTICS affected = ROW_COUNT;
  RETURN affected;
END;
$$;

-- Re-grant EXECUTE on the patched function (some Supabase
-- migrations strip the default grant when the function is recreated).
GRANT EXECUTE ON FUNCTION public.mark_stale_users_offline() TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_stale_users_offline() TO authenticated;

-- Comment for the next reader
COMMENT ON FUNCTION public.mark_stale_users_offline() IS
  'Flips is_online=false on profiles whose last_seen is NULL (never seen) or older than 90s. Called by cron localit-mark-stale-offline every 5 min. Patched 2026-10-02 to also catch NULL last_seen.';