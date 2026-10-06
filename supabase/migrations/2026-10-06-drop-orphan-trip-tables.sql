-- 2026-10-06-drop-orphan-trip-tables.sql
-- Purpose: Drop 3 public tables that have 0 rows and 0 app code references.
-- Reversible: recreate from this file's CREATE TABLE blocks if rollback needed.
--
-- TABLES DROPPED:
--   1. trip_bookings (0 rows, no app code refs — Stripe forward-compat never shipped)
--   2. trip_budget (0 rows, no app code refs — superseded by trips.budget_estimate
--      added in 2026-10-06-itinerary-rebuild.sql)
--   3. webrtc_signals (217 rows, no app code refs — leftover from self-hosted
--      WebRTC stack abandoned 2026-10-01 in favor of LiveKit Cloud)
--
-- VERIFIED SAFE:
--   - All 3 tables have RLS enabled
--   - No triggers attached
--   - service_role grants: trip_bookings + trip_budget have DELETE/INSERT/...,
--     webrtc_signals has full grants. All become irrelevant after drop.
--   - No FK references FROM other tables (verified via information_schema below)
--   - Grep of /app, /components, /lib, /scripts (excluding migrations/) found 0
--     application code references for any of the 3 table names.

BEGIN;

-- Safety: pre-check there are no FK references FROM other tables TO these tables.
-- (FKs going OUT from these tables are fine — DROP CASCADE handles them.)
DO $$
DECLARE
  fk_count INT;
BEGIN
  SELECT COUNT(*) INTO fk_count
  FROM information_schema.referential_constraints rc
  JOIN information_schema.constraint_column_usage ccu
    ON rc.unique_constraint_name = ccu.constraint_name
    AND rc.unique_constraint_schema = ccu.constraint_schema
  WHERE ccu.table_schema = 'public'
    AND ccu.table_name IN ('trip_bookings','trip_budget','webrtc_signals');
  IF fk_count > 0 THEN
    RAISE EXCEPTION 'Refusing to drop: % FK constraints FROM other tables reference these. Inspect first.', fk_count;
  END IF;
END $$;

-- Drop in dependency-free order (no FKs between these 3 themselves).
DROP TABLE IF EXISTS public.trip_bookings CASCADE;
DROP TABLE IF EXISTS public.trip_budget CASCADE;
DROP TABLE IF EXISTS public.webrtc_signals CASCADE;

COMMIT;

-- Post-drop verification (run manually after this migration):
--   SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- Expected: 19 tables (down from 22). Removed: trip_bookings, trip_budget, webrtc_signals.

-- ROLLBACK (if needed):
--   Re-create the tables from the original migration files:
--   - supabase/migrations/2026-09-27-itinerary-v2.sql      (trip_bookings, trip_budget)
--   - supabase/migrations/2026-09-30-webrtc-signals.sql   (webrtc_signals)
--   Then re-grant service_role:
--     GRANT SELECT, INSERT, UPDATE, DELETE ON <table> TO service_role;
