-- ============================================================
-- Buddy default transportation
-- A buddy declares the mode they usually use. trip_stops.transport
-- can override per stop; NULL means "fall back to my buddy profile".
-- Migration includes both buddies.* and trip_stops.* because they're
-- added together — same enum, same semantics, one migration.
-- ============================================================

ALTER TABLE public.buddies
  ADD COLUMN IF NOT EXISTS transport TEXT
    CHECK (transport IN ('walk','scooter','taxi','bike','car','bus','boat','grab','cyclo','other')),
  ADD COLUMN IF NOT EXISTS transport_note TEXT;

COMMENT ON COLUMN public.buddies.transport IS
  'Default mode of transport the buddy uses for trips. Per-stop transport in trip_stops overrides this.';
COMMENT ON COLUMN public.buddies.transport_note IS
  'Free-form note (vehicle plate, scooter size, anything the buddy wants to share).';

ALTER TABLE public.trip_stops
  ADD COLUMN IF NOT EXISTS transport TEXT
    CHECK (transport IN ('walk','scooter','taxi','bike','car','bus','boat','grab','cyclo','other')),
  ADD COLUMN IF NOT EXISTS transport_note TEXT;

CREATE INDEX IF NOT EXISTS idx_trip_stops_transport ON public.trip_stops(transport) WHERE transport IS NOT NULL;

GRANT UPDATE (transport, transport_note) ON public.buddies TO authenticated;
GRANT ALL ON public.trip_stops TO authenticated;
GRANT ALL ON public.trip_stops TO service_role;

-- Composite index for the upcoming-trips dashboard query
-- (buddy_id + status + start_date for ORDER BY start_date ASC).
CREATE INDEX IF NOT EXISTS idx_trips_buddy_status
  ON public.trips(buddy_id, status, start_date);
