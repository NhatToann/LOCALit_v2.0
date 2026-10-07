-- 2026-11-07-create-safe-tourists-view.sql
--
-- Mirror of safe_buddies / safe_profiles for the tourists table.
-- Exposes only non-PII columns and is SELECT-granted to anon + authenticated
-- so that the public Tourist profile page at /tourists/[id] works without
-- exposing date_of_birth, email, phone, or passport.

CREATE OR REPLACE VIEW public.safe_tourists AS
SELECT
  t.id,
  t.nationality,
  t.travel_style,
  t.interests,
  t.languages,
  t.budget_range,
  t.arrival_date,
  t.destination,
  t.is_visible,
  t.created_at,
  t.updated_at
FROM public.tourists AS t
WHERE t.is_visible = true;

-- Grants
GRANT SELECT ON public.safe_tourists TO anon, authenticated, service_role;