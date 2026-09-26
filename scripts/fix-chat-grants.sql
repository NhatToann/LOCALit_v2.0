-- Fix missing grants on `messages` and `trip_stops`. Both tables had table-
-- level GRANTs only to `service_role` and `postgres` — so when the Next.js
-- client used the `authenticated` role (RLS-bypassed at the row level only,
-- not at the column level), every write failed with `permission denied for
-- table <name>`.
--
-- Background: Supabase Cloud does NOT auto-grant table-level privileges
-- to `service_role` (per AGENTS.md). The fix-grants script covers most
-- tables but apparently missed messages/trip_stops when the schema was
-- last re-applied.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trip_stops TO authenticated;
