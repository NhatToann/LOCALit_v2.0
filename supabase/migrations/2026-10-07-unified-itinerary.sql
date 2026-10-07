-- =====================================================================
-- 2026-10-07-unified-itinerary.sql
--
-- Single feature: itinerary. Removes the entire old `trips` family
-- (9 tables) and replaces it with one cohesive set of `itinerary_*`
-- tables. Designed for collaborative editing (owner + invited editors)
-- in the same UI.
--
-- Tables DROPPED (obsolete after this migration):
--   trips, trip_stops, trip_days, trip_bookings, trip_budget,
--   trip_packing_items, trip_activity, trip_travelers, trip_buddies
--
-- Tables KEPT: profiles, tourists, buddies, connections,
--   conversations, messages, reviews, location_updates,
--   message_reactions, email_verifications, pending_calls
--
-- NEW itinerary_* family:
--   itineraries
--   itinerary_days
--   itinerary_stops
--   itinerary_collaborators
--   itinerary_packing
--   itinerary_activity
--   itinerary_bookmarks
--   itinerary_share
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Drop everything trip_* in dependency order
-- ---------------------------------------------------------------------
DROP TABLE IF EXISTS public.trip_travelers CASCADE;
DROP TABLE IF EXISTS public.trip_buddies CASCADE;
DROP TABLE IF EXISTS public.trip_bookings CASCADE;
DROP TABLE IF EXISTS public.trip_packing_items CASCADE;
DROP TABLE IF EXISTS public.trip_activity CASCADE;
DROP TABLE IF EXISTS public.trip_budget CASCADE;
DROP TABLE IF EXISTS public.trip_stops CASCADE;
DROP TABLE IF EXISTS public.trip_days CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;

-- ---------------------------------------------------------------------
-- 2. New itinerary_* tables
-- ---------------------------------------------------------------------

-- 2.1 itineraries — one row per trip
CREATE TABLE public.itineraries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  destination text NOT NULL DEFAULT 'Da Nang',
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planning'
    CHECK (status IN ('planning', 'confirmed', 'completed', 'cancelled')),
  visibility text NOT NULL DEFAULT 'private'
    CHECK (visibility IN ('private', 'shared')),
  notes text,
  budget_estimate_cents int,
  meetup_point text,
  transport text,
  weather_snapshot jsonb,
  weather_updated_at timestamptz,
  last_editor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_itineraries_owner ON public.itineraries(owner_id);
CREATE INDEX idx_itineraries_dates ON public.itineraries(start_date, end_date);
CREATE INDEX idx_itineraries_status ON public.itineraries(status);
ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
CREATE POLICY itineraries_owner_all ON public.itineraries
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
-- Editors can read itineraries they collaborate on
CREATE POLICY itineraries_collab_read ON public.itineraries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itineraries.id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

-- 2.2 itinerary_days — auto-grouped by start_date in UI; this table
--   is for explicit per-day plans (title, theme, day_order).
CREATE TABLE public.itinerary_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  day_order int NOT NULL,
  date date,
  title text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (itinerary_id, day_order)
);
CREATE INDEX idx_itinerary_days_parent ON public.itinerary_days(itinerary_id);
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY itinerary_days_owner ON public.itinerary_days
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_days.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_days.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_days_collab_read ON public.itinerary_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
-- Editors can write (insert/update/delete) days
CREATE POLICY itinerary_days_collab_write ON public.itinerary_days
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  );

-- 2.3 itinerary_stops — places, ordered per day
CREATE TABLE public.itinerary_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  day_id uuid REFERENCES public.itinerary_days(id) ON DELETE CASCADE,
  stop_order int NOT NULL DEFAULT 1,
  name text NOT NULL,
  address text,
  lat double precision,
  lng double precision,
  category text,
  planned_time time,
  duration_minutes int,
  transport text,
  transport_note text,
  opening_hours text,
  est_cost_cents int,
  notes text,
  photo_url text,
  added_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_itinerary_stops_parent ON public.itinerary_stops(itinerary_id);
CREATE INDEX idx_itinerary_stops_day ON public.itinerary_stops(day_id);
CREATE INDEX idx_itinerary_stops_order ON public.itinerary_stops(itinerary_id, day_id, stop_order);
ALTER TABLE public.itinerary_stops ENABLE ROW LEVEL SECURITY;
CREATE POLICY itinerary_stops_owner ON public.itinerary_stops
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_stops.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_stops.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_stops_collab_read ON public.itinerary_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
CREATE POLICY itinerary_stops_collab_write ON public.itinerary_stops
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  );

-- 2.4 itinerary_collaborators — invite + accept flow
CREATE TABLE public.itinerary_collaborators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'editor'
    CHECK (role IN ('owner', 'editor', 'viewer')),
  status text NOT NULL DEFAULT 'invited'
    CHECK (status IN ('invited', 'accepted', 'declined', 'revoked')),
  invited_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  invited_at timestamptz NOT NULL DEFAULT now(),
  responded_at timestamptz,
  UNIQUE (itinerary_id, user_id)
);
CREATE INDEX idx_itinerary_collaborators_user ON public.itinerary_collaborators(user_id);
CREATE INDEX idx_itinerary_collaborators_itin ON public.itinerary_collaborators(itinerary_id);
ALTER TABLE public.itinerary_collaborators ENABLE ROW LEVEL SECURITY;
-- Owner can manage collaborators of their itinerary
CREATE POLICY itinerary_collaborators_owner ON public.itinerary_collaborators
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_collaborators.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_collaborators.itinerary_id AND i.owner_id = auth.uid()
    )
  );
-- Invitee can read their own pending invite
CREATE POLICY itinerary_collaborators_self_read ON public.itinerary_collaborators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Invitee can accept/decline their own invite
CREATE POLICY itinerary_collaborators_self_respond ON public.itinerary_collaborators
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2.5 itinerary_packing — checklist
CREATE TABLE public.itinerary_packing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text,
  packed boolean NOT NULL DEFAULT false,
  assigned_to uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_itinerary_packing_parent ON public.itinerary_packing(itinerary_id);
ALTER TABLE public.itinerary_packing ENABLE ROW LEVEL SECURITY;
CREATE POLICY itinerary_packing_owner ON public.itinerary_packing
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_packing.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_packing.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_packing_collab_read ON public.itinerary_packing
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
CREATE POLICY itinerary_packing_collab_write ON public.itinerary_packing
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  );

-- 2.6 itinerary_activity — append-only log for realtime feed
CREATE TABLE public.itinerary_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verb text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_itinerary_activity_parent ON public.itinerary_activity(itinerary_id, created_at DESC);
ALTER TABLE public.itinerary_activity ENABLE ROW LEVEL SECURITY;
CREATE POLICY itinerary_activity_owner ON public.itinerary_activity
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_activity.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_activity.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_activity_collab_read ON public.itinerary_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_activity.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

-- 2.7 itinerary_bookmarks — quick-add places cached per user
CREATE TABLE public.itinerary_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  place_name text NOT NULL,
  place_address text,
  lat double precision,
  lng double precision,
  category text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_itinerary_bookmarks_parent ON public.itinerary_bookmarks(itinerary_id);
ALTER TABLE public.itinerary_bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY itinerary_bookmarks_owner ON public.itinerary_bookmarks
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- 2.8 itinerary_share — shareable read-only links (one per itinerary)
CREATE TABLE public.itinerary_share (
  itinerary_id uuid PRIMARY KEY REFERENCES public.itineraries(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.itinerary_share ENABLE ROW LEVEL SECURITY;
-- Anyone with token can read; only owner can manage
CREATE POLICY itinerary_share_read ON public.itinerary_share
  FOR SELECT TO anon, authenticated
  USING (enabled = true);
CREATE POLICY itinerary_share_owner ON public.itinerary_share
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_share.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_share.itinerary_id AND i.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------
-- 3. updated_at triggers
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER itineraries_updated_at
  BEFORE UPDATE ON public.itineraries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER itinerary_days_updated_at
  BEFORE UPDATE ON public.itinerary_days
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER itinerary_stops_updated_at
  BEFORE UPDATE ON public.itinerary_stops
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER itinerary_packing_updated_at
  BEFORE UPDATE ON public.itinerary_packing
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------
-- 4. Public read view for safe sharing
-- ---------------------------------------------------------------------
CREATE OR REPLACE VIEW public.safe_itineraries AS
SELECT
  i.id,
  i.title,
  i.destination,
  i.start_date,
  i.end_date,
  i.status,
  i.visibility,
  i.meetup_point,
  i.created_at,
  i.updated_at,
  p.id AS owner_id,
  p.full_name AS owner_name,
  p.avatar_url AS owner_avatar
FROM public.itineraries i
JOIN public.profiles p ON p.id = i.owner_id;

GRANT SELECT ON public.safe_itineraries TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.itineraries,
     public.itinerary_days,
     public.itinerary_stops,
     public.itinerary_collaborators,
     public.itinerary_packing,
     public.itinerary_activity,
     public.itinerary_bookmarks,
     public.itinerary_share
  TO authenticated, service_role;

-- Done.
