-- ============================================================
-- Trips INSERT / DELETE for buddies
-- Original schema.sql only allows the tourist to INSERT a row in
-- `trips` (WITH CHECK auth.uid() = tourist_id). Buddies cannot
-- create new plans, and only the tourist can DELETE. With multi-
-- plan support in 2026-09-27-mvp we need buddies to be able to
-- create plans they own (their buddy_id, someone else's
-- tourist_id) and to delete their own plans.
-- ============================================================

DROP POLICY IF EXISTS "Tourists can create trips" ON public.trips;
CREATE POLICY "Trip participants can create trips"
  ON public.trips FOR INSERT
  WITH CHECK (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

DROP POLICY IF EXISTS "Tourists can delete own trips" ON public.trips;
CREATE POLICY "Trips manageable by tourist or assigned buddy"
  ON public.trips FOR DELETE
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );
