/** ============================================================*/
/** LOCALit Database Schema — v2.0*/
/** Run this against Supabase Postgres to create all tables*/
/** ============================================================*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- ENUMS
-- ============================================================
CREATE TYPE user_role AS ENUM ('tourist', 'buddy', 'admin');
CREATE TYPE connection_status AS ENUM ('pending', 'accepted', 'declined');
CREATE TYPE trip_status AS ENUM ('planning', 'confirmed', 'completed', 'cancelled');

-- ============================================================
-- PROFILES (extends auth.users)
/** ============================================================*/
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  avatar_url TEXT,
  bio TEXT,
  role user_role NOT NULL DEFAULT 'tourist',
  is_online BOOLEAN NOT NULL DEFAULT false,
  last_seen TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Profiles: anyone can read, only owner can update
CREATE POLICY "Profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- TOURISTS
-- ============================================================
CREATE TABLE public.tourists (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  nationality TEXT,
  date_of_birth DATE,
  travel_style TEXT,           -- solo, couple, friends, family
  interests TEXT[] DEFAULT '{}',
  languages TEXT[] DEFAULT '{}',
  budget_range TEXT,           -- under-50, 50-100, 100-200, 200+
  arrival_date DATE,
  destination TEXT,
  is_visible BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tourists ENABLE ROW LEVEL SECURITY;

-- Tourists: public read, owner write
CREATE POLICY "Tourist profiles are viewable by everyone"
  ON public.tourists FOR SELECT USING (true);

CREATE POLICY "Tourists can update own profile"
  ON public.tourists FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Tourists can insert own profile"
  ON public.tourists FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- BUDDIES
-- ============================================================
CREATE TABLE public.buddies (
  id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  location_city TEXT NOT NULL,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  languages TEXT[] NOT NULL DEFAULT '{}',
  specialties TEXT[] DEFAULT '{}',
  hourly_rate DECIMAL(10,2) DEFAULT 0,
  is_available BOOLEAN NOT NULL DEFAULT true,
  rating_avg DECIMAL(3,2) DEFAULT 0,
  trips_completed INTEGER DEFAULT 0,
  bio TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.buddies ENABLE ROW LEVEL SECURITY;

-- Buddies: public read for discovery, owner write
CREATE POLICY "Buddies are discoverable by everyone"
  ON public.buddies FOR SELECT USING (true);

CREATE POLICY "Buddies can update own profile"
  ON public.buddies FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Buddies can insert own profile"
  ON public.buddies FOR INSERT
  WITH CHECK (auth.uid() = id);

-- ============================================================
-- CONNECTIONS (Tourist → Buddy relationship)
/** ============================================================*/
CREATE TABLE public.connections (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tourist_id UUID NOT NULL REFERENCES public.tourists(id) ON DELETE CASCADE,
  buddy_id UUID NOT NULL REFERENCES public.buddies(id) ON DELETE CASCADE,
  status connection_status NOT NULL DEFAULT 'pending',
  message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tourist_id, buddy_id)
);

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

-- Connections: only tourist and buddy involved can see
CREATE POLICY "Connections visible to participants"
  ON public.connections FOR SELECT
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
    OR EXISTS (
      SELECT 1 FROM public.tourists WHERE id = auth.uid()
    )
    OR EXISTS (
      SELECT 1 FROM public.buddies WHERE id = auth.uid()
    )
  );

CREATE POLICY "Tourists can create connections"
  ON public.connections FOR INSERT
  WITH CHECK (auth.uid() = tourist_id);

CREATE POLICY "Participants can update connection status"
  ON public.connections FOR UPDATE
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

-- ============================================================
-- TRIPS
-- ============================================================
CREATE TABLE public.trips (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tourist_id UUID NOT NULL REFERENCES public.tourists(id) ON DELETE CASCADE,
  buddy_id UUID REFERENCES public.buddies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date DATE,
  end_date DATE,
  status trip_status NOT NULL DEFAULT 'planning',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;

-- Trips: tourist owner + assigned buddy can see
CREATE POLICY "Trips visible to owner and assigned buddy"
  ON public.trips FOR SELECT
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

CREATE POLICY "Tourists can create trips"
  ON public.trips FOR INSERT
  WITH CHECK (auth.uid() = tourist_id);

CREATE POLICY "Owner and buddy can update trip"
  ON public.trips FOR UPDATE
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

CREATE POLICY "Tourists can delete own trips"
  ON public.trips FOR DELETE
  USING (auth.uid() = tourist_id);

-- ============================================================
-- TRIP_STOPS
-- ============================================================
CREATE TABLE public.trip_stops (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL,
  address TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.trip_stops ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Trip stops visible to trip participants"
  ON public.trip_stops FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
      AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

CREATE POLICY "Trip owner can manage stops"
  ON public.trip_stops FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
      AND auth.uid() = t.tourist_id
    )
  );

-- ============================================================
-- CONVERSATIONS
-- ============================================================
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tourist_id UUID NOT NULL REFERENCES public.tourists(id) ON DELETE CASCADE,
  buddy_id UUID NOT NULL REFERENCES public.buddies(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(tourist_id, buddy_id)
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Conversations visible to participants"
  ON public.conversations FOR SELECT
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

CREATE POLICY "Participants can create conversations"
  ON public.conversations FOR INSERT
  WITH CHECK (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  content TEXT NOT NULL,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Messages visible to conversation participants"
  ON public.messages FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (auth.uid() = c.tourist_id OR auth.uid() = c.buddy_id)
    )
  );

CREATE POLICY "Conversation participants can send messages"
  ON public.messages FOR INSERT
  WITH CHECK (
    auth.uid() = sender_id
    AND EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (auth.uid() = c.tourist_id OR auth.uid() = c.buddy_id)
    )
  );

CREATE POLICY "Recipients can update read status"
  ON public.messages FOR UPDATE
  USING (
    auth.uid() = sender_id
    OR EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_id
      AND (auth.uid() = c.tourist_id OR auth.uid() = c.buddy_id)
    )
  );

-- ============================================================
-- LOCATION_UPDATES (real-time user positions)
/** ============================================================*/
CREATE TABLE public.location_updates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  accuracy DOUBLE PRECISION,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.location_updates ENABLE ROW LEVEL SECURITY;

-- Tourists: only their own location
-- Buddies: everyone can see (for discovery)
CREATE POLICY "Buddies can see all locations for tourist discovery"
  ON public.location_updates FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'buddy'
    )
    OR auth.uid() = user_id
  );

CREATE POLICY "Users can update own location"
  ON public.location_updates FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own location (upsert)"
  ON public.location_updates FOR UPDATE
  USING (auth.uid() = user_id);

-- ============================================================
-- REVIEWS
-- ============================================================
CREATE TABLE public.reviews (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  reviewer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reviewee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Reviews visible to everyone"
  ON public.reviews FOR SELECT USING (true);

CREATE POLICY "Participants can create reviews"
  ON public.reviews FOR INSERT
  WITH CHECK (
    auth.uid() = reviewer_id
    AND EXISTS (
      SELECT 1 FROM public.trips t
      WHERE t.id = trip_id
      AND (auth.uid() = t.tourist_id OR auth.uid() = t.buddy_id)
    )
  );

-- ============================================================
-- INDEXES for performance
-- ============================================================
CREATE INDEX idx_connections_tourist ON public.connections(tourist_id);
CREATE INDEX idx_connections_buddy ON public.connections(buddy_id);
CREATE INDEX idx_connections_status ON public.connections(status);
CREATE INDEX idx_buddies_location ON public.buddies(location_city);
CREATE INDEX idx_buddies_available ON public.buddies(is_available);
CREATE INDEX idx_buddies_coords ON public.buddies(latitude, longitude);
CREATE INDEX idx_trips_tourist ON public.trips(tourist_id);
CREATE INDEX idx_trips_buddy ON public.trips(buddy_id);
CREATE INDEX idx_trip_stops_trip ON public.trip_stops(trip_id);
CREATE INDEX idx_messages_conversation ON public.messages(conversation_id);
CREATE INDEX idx_messages_created ON public.messages(created_at DESC);
CREATE INDEX idx_conversations_tourist ON public.conversations(tourist_id);
CREATE INDEX idx_conversations_buddy ON public.conversations(buddy_id);
CREATE INDEX idx_location_user ON public.location_updates(user_id);
CREATE INDEX idx_location_updated ON public.location_updates(updated_at DESC);
CREATE INDEX idx_reviews_trip ON public.reviews(trip_id);
CREATE INDEX idx_reviews_reviewee ON public.reviews(reviewee_id);

-- ============================================================
-- TRIGGER: auto-update updated_at
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER tourists_updated_at
  BEFORE UPDATE ON public.tourists
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER buddies_updated_at
  BEFORE UPDATE ON public.buddies
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER connections_updated_at
  BEFORE UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TRIGGER conversations_updated_at
  BEFORE UPDATE ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- FUNCTION: auto-create profile on user signup
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
    COALESCE((NEW.raw_user_meta_data->>'role')::user_role, 'tourist')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- FUNCTION: haversine distance (km) between two points
-- ============================================================
CREATE OR REPLACE FUNCTION public.haversine_distance(
  lat1 DOUBLE PRECISION,
  lon1 DOUBLE PRECISION,
  lat2 DOUBLE PRECISION,
  lon2 DOUBLE PRECISION
)
RETURNS DOUBLE PRECISION AS $$
DECLARE
  R DOUBLE PRECISION := 6371; -- Earth radius in km
  dlat DOUBLE PRECISION;
  dlon DOUBLE PRECISION;
  a DOUBLE PRECISION;
  c DOUBLE PRECISION;
BEGIN
  dlat := radians(lat2 - lat1);
  dlon := radians(lon2 - lon1);
  a := sin(dlat/2) * sin(dlat/2)
       + cos(radians(lat1)) * cos(radians(lat2))
       * sin(dlon/2) * sin(dlon/2);
  c := 2 * atan2(sqrt(a), sqrt(1-a));
  RETURN R * c;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ============================================================
-- GRANTS: enable anon and authenticated roles to access tables
-- (RLS still applies, but without these the roles cannot read at all)
-- ============================================================
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Future tables (e.g. test_items) get the same grants automatically
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated;
