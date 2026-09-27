-- ============================================================
-- Trip stops: allow buddy to manage stops too
-- Original schema.sql only allowed trip owner (tourist) to manage
-- trip_stops. Buddies with an accepted connection were blocked.
-- This aligns trip_stops RLS with trip_bookings + trip_budget.
-- ============================================================

DROP POLICY IF EXISTS "Trip owner can manage stops" ON public.trip_stops;

CREATE POLICY "Trip stops manageable by participants"
  ON public.trip_stops FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

GRANT ALL ON public.trip_stops TO authenticated;
GRANT ALL ON public.trip_stops TO service_role;

-- Same treatment for trip_days (DaysTab CRUD).
DROP POLICY IF EXISTS "trip_days editable by participants" ON public.trip_days;

DROP POLICY IF EXISTS "trip_days visible to participants" ON public.trip_days;
CREATE POLICY "trip_days visible to participants"
  ON public.trip_days FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'trip_days'
      AND policyname = 'trip_days manageable by participants'
  ) THEN
    EXECUTE $POLICY$
      CREATE POLICY "trip_days manageable by participants"
        ON public.trip_days FOR ALL
        USING (
          EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = trip_id
              AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
          )
        )
        WITH CHECK (
          EXISTS (
            SELECT 1 FROM public.trips t
            WHERE t.id = trip_id
              AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
          )
        )
    $POLICY$;
  END IF;
END $$;

GRANT ALL ON public.trip_days TO authenticated;
GRANT ALL ON public.trip_days TO service_role;
