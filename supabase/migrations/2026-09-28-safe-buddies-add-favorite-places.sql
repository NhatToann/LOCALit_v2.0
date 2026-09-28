-- ============================================================
-- Add favorite_places + trips_completed columns to safe_buddies
-- Date: 2026-09-28
-- Why:
--   The /tourist/buddy/[id] page (and the public buddy profile route)
--   queries favorite_places and trips_completed from safe_buddies to
--   render the "favorite places" section and the trips-completed badge.
--   The view was missing these columns even though the direct-table
--   anon grant on public.buddies already includes them (added
--   2026-09-27 for favorite_places; trips_completed was always exposed
--   via the original schema). The query against the view currently
--   fails with `column "favorite_places" does not exist`, which
--   silently nulls out the buddy row via PostgREST error handling.
-- How:
--   Recreate safe_buddies to include favorite_places (TEXT[]) and
--   trips_completed (INTEGER).
-- Safety:
--   - Both columns are non-PII (place names the buddy wants to take
--     visitors to, and a count of completed trips).
--   - No new anon grant is created; this just widens the existing view
--     projection so PostgREST can serve the columns through the view.
-- ============================================================

DROP VIEW IF EXISTS public.safe_buddies;

CREATE VIEW public.safe_buddies AS
SELECT
  id,
  location_city,
  languages,
  specialties,
  hourly_rate,
  is_available,
  rating_avg,
  bio,
  favorite_places,
  trips_completed,
  ROUND(latitude::numeric, 3)::double precision AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.buddies
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

GRANT SELECT ON public.safe_buddies TO anon, authenticated;