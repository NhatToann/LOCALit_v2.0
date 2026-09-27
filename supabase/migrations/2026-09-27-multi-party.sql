-- ============================================================
-- 2026-09-27: Multi-traveler / multi-buddy group data model
-- ============================================================
-- Adds:
--   * `trip_travelers` — who is going on the trip (lead + companions)
--   * `trip_buddies`    — who is guiding the trip (lead + co-buddies)
--   * Backfills lead rows from existing `trips.tourist_id` / `trips.buddy_id`
--   * RLS so participants see the list and leads can invite companions
--
-- Backwards compatible: existing 1:1 flows keep working unchanged. The lead
-- row mirrors trips.tourist_id / trips.buddy_id so all existing queries are
-- unaffected.
-- ============================================================

-- 1) trip_travelers
CREATE TABLE IF NOT EXISTS public.trip_travelers (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  tourist_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'companion'
                CHECK (role IN ('lead', 'companion')),
  invited_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'accepted', 'declined', 'removed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, tourist_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_travelers_trip ON public.trip_travelers(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_travelers_tourist ON public.trip_travelers(tourist_id);

-- 2) trip_buddies
CREATE TABLE IF NOT EXISTS public.trip_buddies (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  buddy_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL DEFAULT 'co-buddy'
                CHECK (role IN ('lead', 'co-buddy')),
  invited_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  status      TEXT NOT NULL DEFAULT 'invited'
                CHECK (status IN ('invited', 'accepted', 'declined', 'removed')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (trip_id, buddy_id)
);
CREATE INDEX IF NOT EXISTS idx_trip_buddies_trip ON public.trip_buddies(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_buddies_buddy ON public.trip_buddies(buddy_id);

-- 3) RLS
ALTER TABLE public.trip_travelers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_buddies    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_travelers_read_participants" ON public.trip_travelers;
CREATE POLICY "trip_travelers_read_participants"
  ON public.trip_travelers FOR SELECT
  USING (
    auth.uid() = tourist_id
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_travelers.trip_id
        AND (t.tourist_id = auth.uid() OR t.buddy_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "trip_buddies_read_participants" ON public.trip_buddies;
CREATE POLICY "trip_buddies_read_participants"
  ON public.trip_buddies FOR SELECT
  USING (
    auth.uid() = buddy_id
    OR EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_buddies.trip_id
        AND (t.tourist_id = auth.uid() OR t.buddy_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "trip_travelers_invite" ON public.trip_travelers;
CREATE POLICY "trip_travelers_invite"
  ON public.trip_travelers FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_travelers.trip_id
        AND (t.tourist_id = auth.uid() OR t.buddy_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "trip_buddies_invite" ON public.trip_buddies;
CREATE POLICY "trip_buddies_invite"
  ON public.trip_buddies FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_buddies.trip_id
        AND (t.tourist_id = auth.uid() OR t.buddy_id = auth.uid())
    )
  );

DROP POLICY IF EXISTS "trip_travelers_self_update" ON public.trip_travelers;
CREATE POLICY "trip_travelers_self_update"
  ON public.trip_travelers FOR UPDATE
  USING (auth.uid() = tourist_id)
  WITH CHECK (auth.uid() = tourist_id);

DROP POLICY IF EXISTS "trip_buddies_self_update" ON public.trip_buddies;
CREATE POLICY "trip_buddies_self_update"
  ON public.trip_buddies FOR UPDATE
  USING (auth.uid() = buddy_id)
  WITH CHECK (auth.uid() = buddy_id);

-- 4) service_role grants (consistent with every other public table)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_travelers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_buddies    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_travelers TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_buddies    TO authenticated;

-- 5) Backfill lead rows from existing 1:1 trips
INSERT INTO public.trip_travelers (trip_id, tourist_id, role, status)
SELECT t.id, t.tourist_id, 'lead', 'accepted'
FROM public.trips t
WHERE t.tourist_id IS NOT NULL
ON CONFLICT (trip_id, tourist_id) DO NOTHING;

INSERT INTO public.trip_buddies (trip_id, buddy_id, role, status)
SELECT t.id, t.buddy_id, 'lead', 'accepted'
FROM public.trips t
WHERE t.buddy_id IS NOT NULL
ON CONFLICT (trip_id, buddy_id) DO NOTHING;

-- Done.
