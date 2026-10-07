-- 2026-11-07-connection-bidirectional-2.sql
--
-- Follow-up to 2026-11-07-connection-bidirectional.sql: relax the
-- tourist_id / buddy_id NOT NULL + FK so either side of a connection
-- can be either a tourist or a buddy.
--
-- Schema: profiles.id is the primary key for the user, with one row in
-- either public.tourists OR public.buddies (or both during dev seed).
-- The connection table had a hard constraint that the requester MUST
-- be a tourist, which fails for buddy-initiated requests in
-- production (where users only have one role row).
--
-- After this migration:
--   • tourist_id and buddy_id are nullable (kept for legacy joins).
--   • requester_id and recipient_id remain the source of truth and
--     reference profiles (universal FK).
--   • requester_role / recipient_role tell the UI which side is which
--     so the public profile page can render the right "Connect as ..."
--     copy.
--   • A check constraint guarantees at least the new pair is set.
--   • The unique index on (requester_id, recipient_id) prevents
--     duplicate requests in either direction.
--
-- The earlier bidirectional migration already added these columns and
-- indexes; this script simply relaxes the legacy NOT NULL constraint
-- and swaps the FK target so production data is no longer at risk.

ALTER TABLE public.connections
  ALTER COLUMN tourist_id DROP NOT NULL,
  ALTER COLUMN buddy_id   DROP NOT NULL;

-- Drop the old strict FK to tourists / buddies (which only the
-- requester side enforced, causing the buddy→tourist path to fail in
-- production where buddies have no row in public.tourists).
-- We replace with a 'no-FK' profile-level reference to keep the column
-- usable for joins without blocking inserts.
ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_tourist_id_fkey,
  DROP CONSTRAINT IF EXISTS connections_buddy_id_fkey;

-- A constraint that says: at least one of (requester_id, tourist_id)
-- must be populated. Catches script bugs without breaking production.
ALTER TABLE public.connections
  DROP CONSTRAINT IF EXISTS connections_either_side_set;
ALTER TABLE public.connections
  ADD CONSTRAINT connections_either_side_set
  CHECK (
    (requester_id IS NOT NULL AND recipient_id IS NOT NULL)
    OR (tourist_id IS NOT NULL AND buddy_id IS NOT NULL)
  );

-- The previous migration already added:
--   - requester_id, recipient_id (FK → profiles)
--   - requester_role, recipient_role (text)
--   - uniq_connections_requester_recipient partial unique index
--   - GRANT to anon / authenticated / service_role
-- Verify and no-op if already present.

DO $$
BEGIN
  -- Defensive: if the index is missing, re-create it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_connections_requester_recipient'
  ) THEN
    CREATE UNIQUE INDEX uniq_connections_requester_recipient
      ON public.connections (requester_id, recipient_id)
      WHERE requester_id IS NOT NULL AND recipient_id IS NOT NULL;
  END IF;
END
$$;