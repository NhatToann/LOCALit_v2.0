-- ============================================================
-- Add bio column to public.safe_buddies view
-- Date: 2026-09-28
-- Why:
--   The 2026-09-28-grant-coords-public.sql migration created safe_buddies
--   WITHOUT bio. The /tourist/browse page renders buddy bios in expanded
--   accordion rows. Anon can no longer read bio from `buddies` directly
--   since the 2026-09-26 PII tightening, so without this column the bio
--   section is always empty on the marketplace.
-- Safety:
--   Bio is already public on a buddy's profile page (anyone can hit
--   /tourist/buddy/<id> and see it). Exposing it through the marketplace
--   listing does not widen the attack surface.
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
  ROUND(latitude::numeric, 3)::double precision AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.buddies
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

GRANT SELECT ON public.safe_buddies TO anon, authenticated;
