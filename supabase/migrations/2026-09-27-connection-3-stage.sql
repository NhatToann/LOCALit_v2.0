-- ============================================================
-- 2026-09-27: Connection 3-stage flow + buddy enhancements
-- ============================================================
-- Adds:
--   * `connection_lifecycle` enum: search -> active -> ended
--   * `accepted_at`, `renewed_by_tourist_at`, `renewed_by_buddy_at`,
--     `ended_at`, `end_reason` on connections
--   * `favorite_places TEXT[]` on buddies (places tourists go to)
--   * `itinerary_notes`, `itinerary_share_token` on trips (shared doc)
-- ============================================================

-- 1) Lifecycle enum (separate from the existing status enum, so we keep
--    the legacy `connection_status` interface for backwards compat).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'connection_lifecycle') THEN
    CREATE TYPE connection_lifecycle AS ENUM ('search', 'active', 'ended');
  END IF;
END
$$;

-- 2) Connection enrichment
ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS lifecycle connection_lifecycle NOT NULL DEFAULT 'search',
  ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewed_by_tourist_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS renewed_by_buddy_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS end_reason TEXT;

-- Auto-derive lifecycle from status on write so the dashboard never shows
-- a stage mismatch.
CREATE OR REPLACE FUNCTION public.derive_connection_lifecycle()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    NEW.lifecycle := 'search';
  ELSIF NEW.status = 'accepted' THEN
    NEW.lifecycle := 'active';
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
  ELSIF NEW.status = 'declined' THEN
    NEW.lifecycle := 'ended';
    IF NEW.ended_at IS NULL THEN
      NEW.ended_at := now();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_connection_lifecycle ON public.connections;
CREATE TRIGGER trg_connection_lifecycle
  BEFORE INSERT OR UPDATE OF status ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.derive_connection_lifecycle();

-- 3) Buddy enhancements: favorite_places (e.g. con-market, my-khe-beach, marble-mountains)
ALTER TABLE public.buddies
  ADD COLUMN IF NOT EXISTS favorite_places TEXT[] NOT NULL DEFAULT '{}';

-- Add favorite_places to the anon-visible column list (it is non-PII and
-- helps tourist discovery).
REVOKE SELECT ON public.buddies FROM anon;
GRANT SELECT (id, location_city, languages, specialties, hourly_rate, is_available, rating_avg, favorite_places)
  ON public.buddies TO anon;

-- 4) Trip itinerary enrichment
ALTER TABLE public.trips
  ADD COLUMN IF NOT EXISTS itinerary_notes TEXT,
  ADD COLUMN IF NOT EXISTS itinerary_updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS itinerary_updated_at TIMESTAMPTZ;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS idx_connections_lifecycle ON public.connections(lifecycle);
CREATE INDEX IF NOT EXISTS idx_connections_accepted_at ON public.connections(accepted_at);
CREATE INDEX IF NOT EXISTS idx_buddies_favorite_places ON public.buddies USING GIN (favorite_places);

-- 6) Backfill: existing accepted connections move to lifecycle=active
UPDATE public.connections
SET lifecycle = 'active', accepted_at = COALESCE(accepted_at, updated_at)
WHERE status = 'accepted' AND lifecycle = 'search';

UPDATE public.connections
SET lifecycle = 'ended', ended_at = COALESCE(ended_at, updated_at)
WHERE status = 'declined' AND lifecycle = 'search';

-- Done.
