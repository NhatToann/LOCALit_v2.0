-- 2026-11-07-connection-bidirectional.sql
--
-- Add a generic requester_id + requester_role pair to public.connections
-- so either a tourist or a buddy can initiate a connection. The legacy
-- tourist_id / buddy_id fields remain in place so the original RLS and
-- index continue to work; new writes should populate BOTH pairs:
--
--   • Asymmetric (tourist→buddy, the historical case):
--       requester_id = tourists.id (same as tourist_id)
--       recipient_id = buddies.id  (same as buddy_id)
--       requester_role = 'tourist'
--
--   • Symmetric (buddy→tourist, added now):
--       requester_id = auth.uid() — the buddy's profile.id
--       recipient_id = tourists.id
--       requester_role = 'buddy'
--
-- We do NOT change the existing tourist_id/buddy_id FK semantics to
-- preserve existing rows + indexes. Instead, requester_id / recipient_id
-- are nullable denormalized pointers; consumers read them preferentially
-- and fall back to tourist_id/buddy_id for old rows.

ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS requester_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS recipient_id    uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS requester_role  text CHECK (requester_role IN ('tourist','buddy')),
  ADD COLUMN IF NOT EXISTS recipient_role  text CHECK (recipient_role IN ('tourist','buddy'));

-- Backfill legacy rows: assume tourist_id/buddy_id refer to profile.id
-- (which is the convention used in the seed data).
UPDATE public.connections
SET requester_id = tourist_id,
    recipient_id = buddy_id,
    requester_role = 'tourist',
    recipient_role = 'buddy'
WHERE requester_id IS NULL;

-- Allow the UNIQUE constraint to apply to either column pair. Drop the
-- old single-axis UNIQUE and add two partial-unique indexes so both
-- directions can coexist without conflict.
ALTER TABLE public.connections DROP CONSTRAINT IF EXISTS connections_tourist_id_buddy_id_key;
CREATE UNIQUE INDEX IF NOT EXISTS uniq_connections_requester_recipient
  ON public.connections (requester_id, recipient_id)
  WHERE requester_id IS NOT NULL AND recipient_id IS NOT NULL;

-- RLS update: participants (requester, recipient) can read or mutate.
DROP POLICY IF EXISTS "Connections visible to participants" ON public.connections;
DROP POLICY IF EXISTS connections_select ON public.connections;
DROP POLICY IF EXISTS connections_insert ON public.connections;
DROP POLICY IF EXISTS connections_update ON public.connections;
DROP POLICY IF EXISTS connections_delete ON public.connections;

CREATE POLICY connections_select ON public.connections
  FOR SELECT TO authenticated
  USING (
    auth.uid() = tourist_id
    OR auth.uid() = buddy_id
    OR auth.uid() = requester_id
    OR auth.uid() = recipient_id
  );

CREATE POLICY connections_insert ON public.connections
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

CREATE POLICY connections_update ON public.connections
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = requester_id
    OR auth.uid() = recipient_id
    OR auth.uid() = tourist_id
    OR auth.uid() = buddy_id
  );

CREATE POLICY connections_delete ON public.connections
  FOR DELETE TO authenticated
  USING (
    auth.uid() = requester_id
    OR auth.uid() = tourist_id
  );

-- Make sure service_role still has full grants (defensive after RLS re-create)
GRANT INSERT, UPDATE, SELECT, DELETE ON public.connections TO service_role;