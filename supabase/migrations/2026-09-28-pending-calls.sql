-- 2026-09-28 — pending_calls table for voice-call signaling
-- Background: prior implementation only used Supabase Realtime broadcast on
-- `call:<conversationId>` channel. Receiver had no way to know about an
-- incoming call unless they happened to be on /chat and subscribed before
-- the caller sent the offer. This table gives us:
--   1. A reliable, queryable "ring" record (survives reconnects).
--   2. A Realtime subscription target so the global incoming-call watcher
--      can notify the user no matter which page they are on.
--   3. A status trail for missed/declined/expired recovery.
--
-- Cleanup: the `messages` table is still the single source of truth for the
-- call history log (call_event rows). This table is transient signaling
-- state only and can be purged by a future pg_cron job.

CREATE TABLE IF NOT EXISTS public.pending_calls (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'ringing'
    CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'cancelled', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '45 seconds')
);

CREATE INDEX IF NOT EXISTS idx_pending_calls_callee_status
  ON public.pending_calls(callee_id, status);
CREATE INDEX IF NOT EXISTS idx_pending_calls_conversation
  ON public.pending_calls(conversation_id);
CREATE INDEX IF NOT EXISTS idx_pending_calls_expires
  ON public.pending_calls(expires_at)
  WHERE status = 'ringing';

ALTER TABLE public.pending_calls ENABLE ROW LEVEL SECURITY;

-- Caller creates row, only for themselves
DROP POLICY IF EXISTS "pending_calls_caller_insert" ON public.pending_calls;
CREATE POLICY "pending_calls_caller_insert"
  ON public.pending_calls
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = caller_id);

-- Both participants can read rows involving them
DROP POLICY IF EXISTS "pending_calls_participants_select" ON public.pending_calls;
CREATE POLICY "pending_calls_participants_select"
  ON public.pending_calls
  FOR SELECT
  TO authenticated
  USING (auth.uid() IN (caller_id, callee_id));

-- Callee can update status (accept / decline)
DROP POLICY IF EXISTS "pending_calls_callee_update" ON public.pending_calls;
CREATE POLICY "pending_calls_callee_update"
  ON public.pending_calls
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = callee_id)
  WITH CHECK (auth.uid() = callee_id);

-- Caller can update their own row (cancel)
DROP POLICY IF EXISTS "pending_calls_caller_update" ON public.pending_calls;
CREATE POLICY "pending_calls_caller_update"
  ON public.pending_calls
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = caller_id)
  WITH CHECK (auth.uid() = caller_id);

-- updated_at trigger
DROP TRIGGER IF EXISTS pending_calls_updated_at ON public.pending_calls;
CREATE TRIGGER pending_calls_updated_at
  BEFORE UPDATE ON public.pending_calls
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

GRANT ALL ON public.pending_calls TO authenticated;
GRANT ALL ON public.pending_calls TO service_role;

-- Realtime broadcast (idempotent — wraps in DO block)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'pending_calls'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.pending_calls;
  END IF;
END
$$;
