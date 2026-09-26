-- ============================================================
-- SECURITY HARDENING — restrict PII access on profiles
-- ============================================================
-- Date: 2026-09-26
-- Issue: profiles.email, profiles.full_name, profiles.phone are readable
--        by anonymous users via the public SELECT policy in schema.sql.
--        Red team audit revealed this leaks PII of all registered users
--        (GDPR concern) and enumerates user UUIDs for further attacks.
--
-- Fix strategy (don't break anonymous discovery):
--   - Profiles: SELECT now requires authentication (no public PII leak).
--   - Public discovery goes through buddies/tourists, which intentionally
--     remain publicly readable but store NO PII (no email/phone).
--   - We add helper views so call-sites that join buddies→profiles still work
--     for the public, by routing them through a public-safe view.
--
-- IMPORTANT: app/page.tsx reads buddies and joins profiles for full_name.
-- To keep that working for anonymous viewers, we create public.safe_profiles
-- view with only safe columns.
-- ============================================================

-- 1. Tighten profiles SELECT to authenticated users only.
DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON public.profiles;
CREATE POLICY "Profiles readable by authenticated users"
  ON public.profiles FOR SELECT
  USING (auth.role() = 'authenticated');

-- 2. Public-safe profile view: only full_name + role + id (no PII).
CREATE OR REPLACE VIEW public.safe_profiles AS
  SELECT id, full_name, role, avatar_url
  FROM public.profiles;
GRANT SELECT ON public.safe_profiles TO anon, authenticated;

-- 3. Reviews: keep public (it's a marketplace — public reviews are normal),
-- but a safe view to strip reviewer/reviewee IDs is also created below.
CREATE OR REPLACE VIEW public.safe_reviews AS
  SELECT id, trip_id, rating, comment, created_at
  FROM public.reviews;
GRANT SELECT ON public.safe_reviews TO anon, authenticated;
