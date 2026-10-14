-- Companion to 2026-10-10-safe-buddies-no-coords.sql.
--
-- `safe_tourists` filters on `is_visible = true` so unlisted travellers do not
-- appear in search results. That is right for discovery, but it made a
-- tourist's own profile 404:
--   GET /tourists/<id> -> 404
-- because the view was the only existence signal the route had.
--
-- This view lists every tourist's descriptive fields. It intentionally omits
-- `date_of_birth` (the PII column the anon revoke targeted) so it grants no
-- access that was not already public through `safe_profiles`.

CREATE OR REPLACE VIEW public.safe_tourists_no_visibility_filter AS
SELECT
    id,
    nationality,
    travel_style,
    interests,
    languages,
    budget_range,
    arrival_date,
    destination,
    created_at,
    updated_at
FROM public.tourists;

COMMENT ON VIEW public.safe_tourists_no_visibility_filter IS
  'Anon-safe tourist listing ignoring is_visible. Omits date_of_birth so it exposes nothing beyond what safe_profiles already publishes.';

GRANT SELECT ON public.safe_tourists_no_visibility_filter TO anon;
GRANT SELECT ON public.safe_tourists_no_visibility_filter TO authenticated;