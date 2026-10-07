-- 2026-10-07-itinerary-stops-bucket-override.sql
--
-- Adds a per-stop bucket override so drag-drop between morning /
-- afternoon / evening doesn't have to rewrite planned_time. The
-- effective bucket on the client is:
--   effectiveBucket(s) = s.day_bucket_override ?? deriveBucket(s.planned_time)
--
-- planned_time stays the canonical scheduled hour; the override
-- lets the user reshuffle the visual order without surprising
-- themselves when they later change planned_time.
--
-- This targets the current schema (itinerary_stops) per the
-- unified-itinerary rebuild (commit 7f2787e). The earlier
-- `trip_stops` table was dropped there.

ALTER TABLE public.itinerary_stops
  ADD COLUMN IF NOT EXISTS day_bucket_override TEXT
    CHECK (day_bucket_override IN ('morning', 'afternoon', 'evening', 'unscheduled'));

-- Combined index: one query can fetch every stop on a day ordered
-- by (effective bucket, stop_order). The COALESCE mirrors the
-- client-side effectiveBucket() so Postgres can serve the same
-- sort order without a function dependency.
CREATE INDEX IF NOT EXISTS idx_itinerary_stops_day_bucket_pos
  ON public.itinerary_stops (day_id, COALESCE(day_bucket_override, 'auto'), stop_order);

-- Defensive: re-grant service_role (AGENTS.md pitfall — Supabase
-- Cloud does NOT auto-grant table-level privileges to service_role,
-- and adding a column can also drop privileges on existing columns).
GRANT SELECT, INSERT, UPDATE, DELETE ON public.itinerary_stops TO service_role;

-- RLS unchanged: itinerary_stops policies already cover all columns.
-- Verified by inspecting current policy definitions.