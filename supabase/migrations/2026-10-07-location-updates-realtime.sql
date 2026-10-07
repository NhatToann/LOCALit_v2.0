-- 2026-10-07: Add location_updates to supabase_realtime publication.
--
-- Before this migration, location_updates was not in the publication, so
-- postgres_changes subscriptions to it never fired. The 2-device live map
-- feature relied on this and silently failed — the WS handshake completed
-- but no events ever made it to the browser, so the peer marker never
-- appeared.
--
-- We only need the WRITE events (INSERT/UPDATE) — a tourist writing their
-- own row should fan out to everyone subscribed so other tourists see the
-- new position. The DELETE event is not emitted on real-time purge.

ALTER PUBLICATION supabase_realtime ADD TABLE public.location_updates;