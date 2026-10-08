-- ============================================================
-- 2026-10-08-swipes-delete-grant
-- Why: The 2026-10-06-swipe-to-match migration granted
--      SELECT, INSERT, UPDATE on public.swipes to the
--      authenticated role but omitted DELETE. The /browse
--      "Save" toggle now issues DELETE /api/swipe to unsave
--      a buddy, which fails with 42501 "permission denied
--      for table swipes" at runtime.
--
-- Fix: extend the existing GRANT to include DELETE, AND add the
-- RLS policy that lets a user delete their own swipes only.
-- The swipes_delete_own policy mirrors swipes_update_own.
--
-- Idempotent: each step is guarded so re-runs are safe.
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated'
      AND table_schema = 'public'
      AND table_name = 'swipes'
      AND privilege_type = 'DELETE'
  ) THEN
    GRANT DELETE ON public.swipes TO authenticated;
  END IF;
END $$;

DROP POLICY IF EXISTS swipes_delete_own ON public.swipes;
CREATE POLICY swipes_delete_own ON public.swipes
  FOR DELETE TO authenticated
  USING (auth.uid() = swiper_id);

