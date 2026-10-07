-- ============================================================
-- Fix: swipe queue shows the tourist themselves + /buddies lists self
-- Date: 2026-10-06
-- Why:
--   The public.safe_buddies view (last recreated on 2026-10-03)
--   only filters `latitude IS NOT NULL AND longitude IS NOT NULL`.
--   It does NOT filter `is_available = true`. RLS on the underlying
--   buddies table hides unavailable buddies from OTHER users, but
--   lets a user see their OWN row via the `auth.uid() = id` clause
--   in the "Buddies discoverable when available and visible" policy.
--   Result: a tourist who ALSO has a row in public.buddies sees
--   themselves in the swipe deck and in /buddies, then gets
--   `cannot swipe on yourself` from the swipe API.
--
--   Two layers of fix:
--   (a) View-level: expose is_available and filter it. This is the
--       source of truth and protects every consumer of safe_buddies
--       (browse, search, queue, likes, matches).
--   (b) Route-level (defense in depth): /api/swipe/queue adds an
--       `id != user.id` predicate so the deck can never surface the
--       current user even if a future migration drops the view
--       filter.
--
-- Safety:
--   - The view previously relied on RLS to filter unavailable rows.
--     RLS still applies; this just makes the view definition
--     consistent with the policy. No new PII exposed.
--   - The view already exposes is_available — no schema widening.
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
  ROUND(latitude::numeric, 3)::double precision  AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.buddies
WHERE is_available = true
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL;

GRANT SELECT ON public.safe_buddies TO anon, authenticated;
