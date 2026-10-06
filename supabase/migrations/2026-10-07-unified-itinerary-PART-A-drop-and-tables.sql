-- =====================================================================
-- 2026-10-07-unified-itinerary-PART-A-drop-and-tables.sql
-- =====================================================================

DROP TABLE IF EXISTS public.trip_travelers CASCADE;
DROP TABLE IF EXISTS public.trip_buddies CASCADE;
DROP TABLE IF EXISTS public.trip_bookings CASCADE;
DROP TABLE IF EXISTS public.trip_packing_items CASCADE;
DROP TABLE IF EXISTS public.trip_activity CASCADE;
DROP TABLE IF EXISTS public.trip_budget CASCADE;
DROP TABLE IF EXISTS public.trip_stops CASCADE;
DROP TABLE IF EXISTS public.trip_days CASCADE;
DROP TABLE IF EXISTS public.trips CASCADE;

-- Itineraries (parent)
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

-- Collaborators (created BEFORE days/stops so RLS subqueries resolve)
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

-- Days
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

-- Stops
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

-- Packing
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

-- Activity (append-only)
CREATE TABLE public.itinerary_activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  itinerary_id uuid NOT NULL REFERENCES public.itineraries(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  verb text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_itinerary_activity_parent ON public.itinerary_activity(itinerary_id, created_at DESC);

-- Bookmarks
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

-- Share
CREATE TABLE public.itinerary_share (
  itinerary_id uuid PRIMARY KEY REFERENCES public.itineraries(id) ON DELETE CASCADE,
  token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(16), 'hex'),
  enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
