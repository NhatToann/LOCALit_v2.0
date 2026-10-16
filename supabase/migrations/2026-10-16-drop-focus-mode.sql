-- ============================================================
-- 2026-10-16: Drop Focus Mode subsystem
-- ============================================================
-- Per product decision 2026-10-16, the Focus Mode feature
-- (request → session → shared live map + chat) is being retired.
-- It was brittle (always-on GPS prompt, separate chat surface,
-- page-lock), the user-facing Flow was underused, and removing it
-- simplifies the codebase and shrinks realtime + RAM pressure.
--
-- What this migration drops:
--   1. `public.focus_requests`  — the request window
--   2. `public.focus_sessions`  — the active/ended session rows
--   3. `public.buddies.is_in_focus` — the column the focus page
--      used to fast-filter buddies currently in a session
--   4. `public.focus_requests` and `public.focus_sessions` rows
--      from the `supabase_realtime` publication (so the postgres_changes
--      fan-out stops listening for them)
--   5. The `focus_request`, `focus_accepted`, `focus_declined`
--      values from the `notification_type` enum (so no future
--      notification can resurrect the feature)
--   6. RLS policies attached to focus_requests / focus_sessions
--      (dropped automatically via DROP TABLE … CASCADE below)
--
-- What this migration does NOT touch:
--   - `public.notifications` rows that happened to be created with
--     `type='focus_request' | 'focus_accepted' | 'focus_declined'`.
--     The client code (NotificationBell, NotificationsPageClient)
--     was updated in the same commit to drop those types from its
--     icon / label maps, so the historical rows render with a
--     neutral icon but no longer break the page. Deleting them is
--     deferred to a separate cleanup script.
-- ============================================================

-- 1. Drop RLS-bound tables (CASCADE drops dependent policies).
DROP TABLE IF EXISTS public.focus_requests CASCADE;
DROP TABLE IF EXISTS public.focus_sessions CASCADE;

-- 2. Drop the buddies.is_in_focus column.
ALTER TABLE public.buddies DROP COLUMN IF EXISTS is_in_focus;

-- 3. Remove the tables from the realtime publication (idempotent).
DO $$
DECLARE
  pubname text := 'supabase_realtime';
  tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY['focus_requests', 'focus_sessions']
  LOOP
    IF EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = pubname
        AND schemaname = 'public'
        AND tablename = tbl
    ) THEN
      EXECUTE format('ALTER PUBLICATION %I DROP TABLE public.%I', pubname, tbl);
    END IF;
  END LOOP;
END $$;

-- 4. Remove the focus_* values from the notification_type enum.
-- ALTER TYPE ... DROP VALUE is supported in PG 12+ and required
-- because new INSERTs would fail the moment we add a CHECK
-- constraint on notifications.type.
DO $$
DECLARE
  v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['focus_request', 'focus_accepted', 'focus_declined']
  LOOP
    IF EXISTS (
      SELECT 1 FROM pg_enum
      WHERE enumlabel = v
        AND enumtypid = 'notification_type'::regtype
    ) THEN
      EXECUTE format('ALTER TYPE notification_type DROP VALUE %L', v);
    END IF;
  END LOOP;
END $$;

-- ============================================================
-- Notes for the operator:
-- • After applying this migration, run
--     `node scripts/cleanup-focus-notification-rows.mjs`
--   (created in the same commit) to wipe any leftover
--   `type='focus_*'` rows from public.notifications. They are
--   harmless but stale.
-- • The `scripts/diag-focus-*.mjs` and `scripts/smoke-focus-*.mjs`
--   scripts are also being deleted in this commit; their diagnostic
--   value disappears along with the feature.
-- ============================================================
