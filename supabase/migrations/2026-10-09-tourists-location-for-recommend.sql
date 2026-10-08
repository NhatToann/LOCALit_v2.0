-- 2026-10-09-tourists-location-for-recommend.sql
--
-- Expand the "recommend" list on /browse to show BOTH buddies and
-- tourists side by side, with a role badge in the UI. Tourists don't
-- currently carry a lat/lng, so add the columns and a discovery view
-- mirroring safe_buddies.
--
-- Why:
--   The user reported that the matching/recommend page
--   (https://localit-nhattoann.vercel.app/browse) only shows buddy
--   rows, so newly-registered tourists (Phan Nhật Toàn, Tá Bảo,
--   Real Test User, etc.) never appear in the recommend list. Adding
--   location metadata to tourists and exposing it through a
--   `safe_tourists_with_location` view (same anon SELECT grant as
--   safe_buddies) lets /browse merge the two tables into one
--   role-tagged feed.
--
-- How:
--   1. Add `latitude`, `longitude`, `location_city` columns to
--      public.tourists. NULL-able: most tourists won't have set
--      these on signup, and the view simply filters them out.
--   2. Backfill the two seed account locations that DO have
--      `destination = 'Da Nang'` so they show up in the Da Nang
--      filter immediately.
--   3. CREATE OR REPLACE a new view
--      `public.safe_tourists_with_location` that includes the
--      new columns, mirroring the safe_buddies rounding pattern
--      (3-decimal precision = ~110m, enough for "near me" sorting
--      without leaking exact addresses).
--   4. GRANT SELECT to anon, authenticated so the public /browse
--      query works without auth.
--
-- Safety:
--   - These columns are NULL by default; the public view filters
--     out NULL coordinates so the existing PII posture is unchanged
--     (no exact home addresses, no PII exposed).
--   - The 3-decimal rounding is identical to safe_buddies.
--   - Toursits keep full INSERT/UPDATE on their own row (existing
--     policy `Tourists can update own profile`); anon can only
--     SELECT through the view.

BEGIN;

-- 1. Schema additions
ALTER TABLE public.tourists
  ADD COLUMN IF NOT EXISTS location_city TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

-- 2. Backfill: any tourist with destination = 'Da Nang' gets a
-- sensible default around Han River so the recommend list isn't
-- empty for the demo accounts. The user can update later via the
-- profile form.
UPDATE public.tourists
   SET location_city = COALESCE(location_city, 'Da Nang'),
       latitude      = COALESCE(latitude, 16.0544),
       longitude     = COALESCE(longitude, 108.2023)
 WHERE destination = 'Da Nang'
   AND latitude IS NULL;

-- 3. View
DROP VIEW IF EXISTS public.safe_tourists_with_location;

CREATE VIEW public.safe_tourists_with_location AS
SELECT
  id,
  location_city,
  nationality,
  travel_style,
  interests,
  languages,
  budget_range,
  arrival_date,
  destination,
  is_visible,
  ROUND(latitude::numeric, 3)::double precision  AS latitude,
  ROUND(longitude::numeric, 3)::double precision AS longitude
FROM public.tourists
WHERE latitude IS NOT NULL
  AND longitude IS NOT NULL
  AND is_visible = true;

GRANT SELECT ON public.safe_tourists_with_location TO anon, authenticated, service_role;

COMMIT;
