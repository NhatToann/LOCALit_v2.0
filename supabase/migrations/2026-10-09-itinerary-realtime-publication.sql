-- Add itinerary_days and itinerary_stops to the supabase_realtime
-- publication so the board subscribes to live changes.
--
-- Without this, the postgres_changes listener in
-- hooks/useItineraryRealtime.ts connects and gets status=SUB-
-- SCRIBED but no events ever fire, because the publication
-- whitelist does not include these two tables.
--
-- This is the same pattern as
-- supabase/migrations/2026-10-07-location-updates-realtime.sql.
ALTER PUBLICATION supabase_realtime ADD TABLE public.itinerary_days;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itinerary_stops;
