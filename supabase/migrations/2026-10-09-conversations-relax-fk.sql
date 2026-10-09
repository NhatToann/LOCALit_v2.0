-- supabase/migrations/2026-10-09-conversations-relax-fk.sql
-- Relax conversations FKs so any two profiles can chat regardless of
-- role. The marketplace was previously tourist↔buddy only — chat now
-- allows tourist↔tourist and buddy↔buddy.
--
-- - Drop the two hard FKs to tourists / buddies.
-- - Re-add them pointing to profiles, which has a row for every user.
-- - This preserves referential integrity (both columns must reference
--   a real profile) without coupling them to the role-table.
--
-- Focus Mode is the only feature that still requires cross-role
-- pairing, and that gate now lives in /api/focus/request.
--
-- All 2 existing conversation rows already have valid tourist_id and
-- buddy_id values that resolve to profiles. The migration is safe to
-- run in either order on a live system.

ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_tourist_id_fkey;
ALTER TABLE public.conversations
  DROP CONSTRAINT IF EXISTS conversations_buddy_id_fkey;

ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_tourist_id_fkey
  FOREIGN KEY (tourist_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;
ALTER TABLE public.conversations
  ADD CONSTRAINT conversations_buddy_id_fkey
  FOREIGN KEY (buddy_id)
  REFERENCES public.profiles(id)
  ON DELETE CASCADE;
