-- 2026-10-06-itinerary-rebuild.sql
-- Purpose: Add columns for OSM integration, multi-user collab LWW, weather snapshot.
-- Reversible: DROP COLUMN IF EXISTS for each new column.

BEGIN;

-- trip_stops: OSM provenance + LWW
ALTER TABLE trip_stops
  ADD COLUMN IF NOT EXISTS osm_id BIGINT,
  ADD COLUMN IF NOT EXISTS osm_type TEXT,
  ADD COLUMN IF NOT EXISTS opening_hours TEXT,
  ADD COLUMN IF NOT EXISTS phone TEXT,
  ADD COLUMN IF NOT EXISTS website TEXT,
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- trip_days: LWW
ALTER TABLE trip_days
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- trip_packing_items: per-traveler pack + LWW
ALTER TABLE trip_packing_items
  ADD COLUMN IF NOT EXISTS assigned_to UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_by UUID REFERENCES profiles(id),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- trips: weather snapshot + budget
ALTER TABLE trips
  ADD COLUMN IF NOT EXISTS weather_snapshot JSONB,
  ADD COLUMN IF NOT EXISTS budget_estimate NUMERIC;

-- Defensive: re-grant service_role (AGENTS.md pitfall)
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_stops TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_days TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON trip_packing_items TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON trips TO service_role;

COMMIT;
