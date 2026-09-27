-- ============================================================
-- 2026-09-27 — theme preference on profiles
-- Adds theme_pref column (light | dark | system) with default 'system'.
-- Idempotent. RLS unchanged (profile owner already has UPDATE).
-- ============================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS theme_pref text NOT NULL DEFAULT 'system';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'profiles_theme_pref_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_theme_pref_check
      CHECK (theme_pref IN ('light', 'dark', 'system'));
  END IF;
END $$;
