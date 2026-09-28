-- ============================================================
-- Extend public.safe_profiles to include is_online
-- Date: 2026-09-28
-- Why:
--   The 2026-09-26 RLS tightening restricted profiles SELECT to
--   authenticated users and exposed only (id, full_name, role, avatar_url)
--   via public.safe_profiles. However 12 client queries still ask for
--   profile.is_online — the marketplace visibility flag — when rendering
--   buddy/tourant cards. With is_online missing from the view, those joins
--   either fail or silently null out the online indicator.
-- How:
--   Recreate safe_profiles to include is_online. Phone, bio, email stay
--   off the view (those are PII and require an authenticated direct read
--   against public.profiles).
-- Safety:
--   - is_online is a boolean marketplace visibility signal, not PII.
--   - Anon SELECT on profiles was already restricted; this view is the
--     only path anon can use to read any profile column, so we are not
--     widening any direct grant.
-- ============================================================

DROP VIEW IF EXISTS public.safe_profiles;

CREATE VIEW public.safe_profiles AS
SELECT
  id,
  full_name,
  role,
  avatar_url,
  is_online
FROM public.profiles;

GRANT SELECT ON public.safe_profiles TO anon, authenticated;
