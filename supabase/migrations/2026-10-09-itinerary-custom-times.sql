-- =====================================================================
-- 2026-10-09-itinerary-custom-times.sql
-- Add per-list / per-card custom time attributes.
-- The board lets users group stops into day-lists and assign each
-- list + each stop its own start_time / end_time (independent of the
-- legacy morning/afternoon/evening bucket columns).
-- =====================================================================

-- Itinerary days: optional custom time window per list
ALTER TABLE public.itinerary_days
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

-- Itinerary stops: optional per-card start/end time. The existing
-- planned_time + duration_minutes still drive the default rendering;
-- these new columns override when set (e.g. drag a stop that runs
-- 14:00–15:30, no math required).
ALTER TABLE public.itinerary_stops
  ADD COLUMN IF NOT EXISTS start_time time,
  ADD COLUMN IF NOT EXISTS end_time time;

-- Reuse the updated_at trigger that already exists for these tables.
