-- ============================================================
-- Restore missing columns in public.safe_buddies view
-- Date: 2026-10-03
-- Why:
--   The 2026-10-02-smart-buddy-search.sql migration recreated
--   safe_buddies to add `search_tsv`, but DROPPED four columns that
--   /tourist/buddies/[id] (BuddyDetailPage) was selecting:
--     - transport        (jsonb; see lib/transport.ts)
--     - transport_note   (text)
--     - favorite_places  (text[])
--     - trips_completed  (integer)
--   PostgREST returns 42703 ("column does not exist"), PostgREST
--   error-handling nulls the row, and the server component calls
--   notFound() → user sees a generic 404 instead of the buddy
--   profile. Reproducible on /buddies/44444444-... (Linh Tran) and
--   every other seeded buddy.
--   Verified locally:
--     GET /rest/v1/safe_buddies?select=id,transport
--       → {"code":"42703","message":"column safe_buddies.transport does not exist"}
--     GET /rest/v1/safe_buddies?id=eq.44444444-...&select=id,location_city
--       → returns the row successfully.
-- How:
--   Recreate safe_buddies with all the previously-exposed columns
--   PLUS the new search_tsv column from 2026-10-02.
-- Safety:
--   - These columns are already granted to anon via the underlying
--     `buddies` table (2026-09-26_revoke_pii_columns + 2026-09-27
--     buddy-transport). Exposing them through the view does not
--     widen the attack surface.
--   - ORDER, predicates, and grants are unchanged.
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
  transport,
  transport_note,
  search_tsv,
  ROUND(latitude::numeric, 3)::double precision AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.buddies
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL;

GRANT SELECT ON public.safe_buddies TO anon, authenticated;