-- ============================================================
-- ITINERARY V2 — Collaborative trip planner
-- Adds: trip_days, trip_bookings, trip_budget, trip_packing_items,
--       trip_activity, share_token, expands trip_stops + trips.
-- See plan in chat history: A1.
-- ============================================================

-- 1) trip_days — multiple day cards per trip (TREK-style)
CREATE TABLE IF NOT EXISTS public.trip_days (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  day_order INTEGER NOT NULL DEFAULT 0,
  date DATE,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_days_trip_id ON public.trip_days(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_days_order ON public.trip_days(trip_id, day_order);

ALTER TABLE public.trip_days ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "trip_days editable by participants" ON public.trip_days;
CREATE POLICY "trip_days editable by participants"
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
  );

GRANT ALL ON public.trip_days TO authenticated;
GRANT ALL ON public.trip_days TO service_role;

-- 2) Expand trip_stops: planned_time, day_id, category, photo_url, est_cost_cents
ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS day_id UUID REFERENCES public.trip_days(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS planned_time TIME,
  ADD COLUMN IF NOT EXISTS category TEXT CHECK (category IN ('food','sight','transport','stay','activity','other')),
  ADD COLUMN IF NOT EXISTS photo_url TEXT,
  ADD COLUMN IF NOT EXISTS est_cost_cents INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_trip_stops_day_id ON public.trip_stops(day_id);

GRANT ALL ON public.trip_stops TO service_role;

-- 3) trip_bookings — flights, hotels, restaurants w/ confirmation codes
CREATE TABLE IF NOT EXISTS public.trip_bookings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('flight','hotel','restaurant','tour','transport','other')),
  provider TEXT,
  confirmation_code TEXT,
  start_at TIMESTAMPTZ,
  end_at TIMESTAMPTZ,
  location_name TEXT,
  address TEXT,
  cost_cents INTEGER DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  attachment_url TEXT,
  added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_bookings_trip_id ON public.trip_bookings(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_bookings_start ON public.trip_bookings(start_at);

ALTER TABLE public.trip_bookings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_bookings visible to participants" ON public.trip_bookings;
CREATE POLICY "trip_bookings visible to participants"
  ON public.trip_bookings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

DROP POLICY IF EXISTS "trip_bookings editable by participants" ON public.trip_bookings;
CREATE POLICY "trip_bookings editable by participants"
  ON public.trip_bookings FOR ALL
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

GRANT ALL ON public.trip_bookings TO authenticated;
GRANT ALL ON public.trip_bookings TO service_role;

-- 4) trip_budget — expense tracker w/ split
CREATE TABLE IF NOT EXISTS public.trip_budget (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK (category IN ('food','transport','tickets','shopping','stay','other')),
  description TEXT,
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  paid_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  split_with UUID[] DEFAULT '{}',
  spent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_budget_trip_id ON public.trip_budget(trip_id);

ALTER TABLE public.trip_budget ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_budget visible to participants" ON public.trip_budget;
CREATE POLICY "trip_budget visible to participants"
  ON public.trip_budget FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

DROP POLICY IF EXISTS "trip_budget editable by participants" ON public.trip_budget;
CREATE POLICY "trip_budget editable by participants"
  ON public.trip_budget FOR ALL
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

GRANT ALL ON public.trip_budget TO authenticated;
GRANT ALL ON public.trip_budget TO service_role;

-- 5) trip_packing_items — checklist
CREATE TABLE IF NOT EXISTS public.trip_packing_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  item TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'misc' CHECK (category IN ('clothes','toiletries','tech','docs','misc')),
  is_packed BOOLEAN NOT NULL DEFAULT false,
  packed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  packed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_packing_trip_id ON public.trip_packing_items(trip_id);

ALTER TABLE public.trip_packing_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_packing visible to participants" ON public.trip_packing_items;
CREATE POLICY "trip_packing visible to participants"
  ON public.trip_packing_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

DROP POLICY IF EXISTS "trip_packing editable by participants" ON public.trip_packing_items;
CREATE POLICY "trip_packing editable by participants"
  ON public.trip_packing_items FOR ALL
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

GRANT ALL ON public.trip_packing_items TO authenticated;
GRANT ALL ON public.trip_packing_items TO service_role;

-- 6) trip_activity — collaboration audit log
CREATE TABLE IF NOT EXISTS public.trip_activity (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  verb TEXT NOT NULL,           -- 'added_stop'|'edited_notes'|'added_day'|'added_booking'|'added_expense'|'packed_item'|'completed_day'|'renamed_trip'
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_trip_activity_trip_id ON public.trip_activity(trip_id, created_at DESC);

ALTER TABLE public.trip_activity ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "trip_activity visible to participants" ON public.trip_activity;
CREATE POLICY "trip_activity visible to participants"
  ON public.trip_activity FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

DROP POLICY IF EXISTS "trip_activity insertable by participants" ON public.trip_activity;
CREATE POLICY "trip_activity insertable by participants"
  ON public.trip_activity FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
        AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

GRANT ALL ON public.trip_activity TO authenticated;
GRANT ALL ON public.trip_activity TO service_role;

-- 7) Trips: share_token, currency, budget_total, cover_photo
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD',
  ADD COLUMN IF NOT EXISTS budget_total_cents INTEGER,
  ADD COLUMN IF NOT EXISTS cover_photo_url TEXT,
  ADD COLUMN IF NOT EXISTS share_token TEXT UNIQUE DEFAULT encode(gen_random_bytes(12),'hex');

CREATE INDEX IF NOT EXISTS idx_trips_share_token ON public.trips(share_token);

-- 8) Auto-set share_token on insert if missing
CREATE OR REPLACE FUNCTION public.trips_set_share_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  IF NEW.share_token IS NULL THEN
    NEW.share_token := encode(gen_random_bytes(12), 'hex');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_share_token ON public.trips;
CREATE TRIGGER trips_share_token
  BEFORE INSERT ON public.trips
  FOR EACH ROW
  EXECUTE FUNCTION public.trips_set_share_token();

-- 9) Public read-only view for shared itineraries
CREATE OR REPLACE VIEW public.shared_trip_view AS
SELECT
  t.id AS trip_id,
  t.title,
  t.destination,
  t.start_date,
  t.end_date,
  t.currency,
  t.budget_total_cents,
  t.cover_photo_url,
  t.share_token,
  t.itinerary_notes,
  t.updated_at,
  json_build_object(
    'id', tp.id,
    'full_name', tp.full_name,
    'avatar_url', tp.avatar_url
  ) AS tourist,
  json_build_object(
    'id', bp.id,
    'full_name', bp.full_name,
    'avatar_url', bp.avatar_url,
    'location_city', b.location_city
  ) AS buddy
FROM public.trips t
LEFT JOIN public.tourists tt ON tt.id = t.tourist_id
LEFT JOIN public.profiles tp ON tp.id = tt.id
LEFT JOIN public.buddies b ON b.id = t.buddy_id
LEFT JOIN public.profiles bp ON bp.id = b.id
WHERE t.share_token IS NOT NULL;

GRANT SELECT ON public.shared_trip_view TO anon, authenticated;
