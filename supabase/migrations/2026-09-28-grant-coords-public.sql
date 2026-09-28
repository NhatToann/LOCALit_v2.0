-- ============================================================
-- Restore public-readable buddy coordinates (rounded to ~110 m)
-- Date: 2026-09-28
-- Why:
--   The 2026-09-26 PII tightening migration revoked anon SELECT on
--   buddies.latitude / buddies.longitude, which broke every map page
--   that filtered buddies by `.not('latitude', 'is', null)`. Anon
--   could no longer see coordinates, so /map, /tourist/dashboard,
--   /tourist/browse and the MapView component rendered zero pins.
-- How:
--   - Create a public.safe_buddies view that rounds lat/long to 3
--     decimal places (~110 m) — accurate enough for "show me buddies
--     near Da Nang" pin placement, accurate enough to NOT identify
--     someone's home.
--   - Grant anon + authenticated SELECT on the view.
--   - Reaffirm the column-level grant on `buddies` so authenticated
--     users (buddies editing themselves, service_role, admin) keep
--     access to exact coordinates.
-- Safety:
--   - Public discovery doesn't need tourist-side coordinates; those
--     stay on the auth-only location_updates table.
--   - 3-decimal precision is the same fuzzing Google Maps' "approximate"
--     view uses and roughly matches the existing safe_profiles pattern.
-- ============================================================

-- 1) Public view with rounded coords
CREATE OR REPLACE VIEW public.safe_buddies AS
SELECT
  id,
  location_city,
  languages,
  specialties,
  hourly_rate,
  is_available,
  rating_avg,
  ROUND(latitude::numeric, 3)::double precision AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.buddies
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

GRANT SELECT ON public.safe_buddies TO anon, authenticated;

-- 2) Reaffirm that authenticated callers keep exact lat/long on buddies.
--    The 2026-09-26 column grants on `buddies` did NOT include latitude /
--    longitude. Without this, signed-in buddies looking at their own
--    dashboard could no longer read their stored coordinates back.
GRANT SELECT (latitude, longitude) ON public.buddies TO authenticated;
