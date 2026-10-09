-- supabase/migrations/2026-10-09-connections-buddy-fk.sql
-- Add the missing FK from connections.buddy_id -> buddies.id so PostgREST
-- can resolve the `buddy:buddies(...)` embed on /dashboard. Without it,
-- the dashboard query 400s with PGRST200 "Could not find a relationship
-- between 'connections' and 'buddies'".
--
-- All 3 existing rows already have a valid buddy_id, so this is safe.
-- (Verified with scripts/diag-connections-integrity.mjs on 2026-10-09.)

ALTER TABLE public.connections
  ADD CONSTRAINT connections_buddy_id_fkey
  FOREIGN KEY (buddy_id)
  REFERENCES public.buddies(id)
  ON DELETE CASCADE;
