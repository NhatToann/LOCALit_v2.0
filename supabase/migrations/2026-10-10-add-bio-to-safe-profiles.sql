-- 2026-10-10-add-bio-to-safe-profiles.sql
-- Add the bio column to safe_profiles so /buddies/[id] and
-- /tourists/[id] can show the bio from profiles.bio (the one
-- the buddy/tourist edits on /profile) without exposing PII.
CREATE OR REPLACE VIEW public.safe_profiles AS
SELECT
  id,
  full_name,
  role,
  avatar_url,
  is_online,
  bio
FROM profiles;
