-- WebRTC signaling transport via Postgres + Realtime (postgres_changes).
--
-- Background (2026-09-30): Supabase Realtime broadcast was unreliable
-- because the WebSocket connection kept falling back to REST API
-- (browser context cookies don't carry the access_token in the WS
-- upgrade request). Broadcast messages between peers were never
-- delivered: the caller sent offer/ICE candidates but the callee
-- never received them, leaving the call stuck in "Connecting…".
--
-- This migration adds a `webrtc_signals` table that stores each
-- signaling message (offer / answer / ice-candidate / bye) as a row.
-- Both peers subscribe to `postgres_changes` for INSERTs where
-- `to_user_id = me` and the realtime gateway handles fan-out
-- through the existing authenticated realtime channel — which we
-- know works because `useIncomingCall` uses the same pattern
-- successfully.

CREATE TABLE IF NOT EXISTS public.webrtc_signals (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id     uuid NOT NULL,
  from_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('offer', 'answer', 'ice-candidate', 'bye')),
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz NOT NULL DEFAULT (now() + interval '60 seconds')
);

CREATE INDEX IF NOT EXISTS webrtc_signals_to_user_created_idx
  ON public.webrtc_signals (to_user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS webrtc_signals_call_id_idx
  ON public.webrtc_signals (call_id);

ALTER TABLE public.webrtc_signals ENABLE ROW LEVEL SECURITY;

-- Senders may INSERT only with themselves as `from_user_id`. RLS
-- enforces this so a compromised client can't impersonate another
-- peer.
DROP POLICY IF EXISTS webrtc_signals_insert_self ON public.webrtc_signals;
CREATE POLICY webrtc_signals_insert_self ON public.webrtc_signals
  FOR INSERT
  WITH CHECK (from_user_id = auth.uid());

-- Recipients may SELECT their own incoming signals. Once consumed
-- the client deletes the row (and a nightly cron purges anything
-- past `expires_at`).
DROP POLICY IF EXISTS webrtc_signals_select_incoming ON public.webrtc_signals;
CREATE POLICY webrtc_signals_select_incoming ON public.webrtc_signals
  FOR SELECT
  USING (to_user_id = auth.uid());

DROP POLICY IF EXISTS webrtc_signals_delete_incoming ON public.webrtc_signals;
CREATE POLICY webrtc_signals_delete_incoming ON public.webrtc_signals
  FOR DELETE
  USING (to_user_id = auth.uid());

-- Service role needs full access for diagnostics / cleanup scripts.
GRANT ALL ON public.webrtc_signals TO service_role;
GRANT INSERT, SELECT, DELETE ON public.webrtc_signals TO authenticated;

-- Realtime publication: clients subscribe via postgres_changes for
-- INSERT events where to_user_id = me. The filter is applied client-side.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'webrtc_signals'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.webrtc_signals;
  END IF;
END
$$;
