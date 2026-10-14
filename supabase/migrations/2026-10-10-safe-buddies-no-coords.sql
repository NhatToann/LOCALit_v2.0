-- Public, anon-safe view of buddies WITHOUT the coordinate filter.
--
-- WHY (2026-10-10)
-- `safe_buddies` filters on `latitude IS NOT NULL AND longitude IS NOT NULL`
-- to avoid leaking precise home coordinates. That is correct for map pins,
-- but it also hid every coordinate-less buddy from their own profile page:
--   GET /buddies/aaaa1111-... -> 404
-- because the view was the only existence signal the route had.
--
-- This view exposes the descriptive fields for ALL buddies and simply omits
-- latitude/longitude entirely, so nothing here is more sensitive than what
-- `safe_buddies` already publishes. The route uses it as the fallback when
-- `safe_buddies` misses, and renders the profile without a map pin.
--
-- Same column set as safe_buddies minus the two coordinate columns.

CREATE OR REPLACE VIEW public.safe_buddies_no_coords AS
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
    search_tsv
FROM public.buddies;

COMMENT ON VIEW public.safe_buddies_no_coords IS
  'Anon-safe buddy listing without GPS. Exposes descriptive profile fields only; intentionally omits latitude/longitude so it never leaks precise location.';

-- anon must be able to SELECT the view. `CREATE OR REPLACE VIEW` resets
-- ownership/privileges, so re-grant every time this migration is applied.
GRANT SELECT ON public.safe_buddies_no_coords TO anon;
GRANT SELECT ON public.safe_buddies_no_coords TO authenticated;