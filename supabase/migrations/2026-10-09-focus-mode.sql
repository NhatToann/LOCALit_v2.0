-- ============================================================
-- 2026-10-09: Focus Mode (shared trip session between buddy & tourist)
-- ============================================================
-- Focus Mode is a 5-minute request-based shared session where a buddy
-- and tourist share their live map, a shared itinerary, and a focus
-- chat. When the session ends, it becomes a permanent row in the
-- user's "Travel history" on their profile.
--
-- Tables:
--   focus_requests  — 5-min request window (pending/accepted/declined/expired/cancelled)
--   focus_sessions  — active + past sessions with optional shared itinerary
--
-- We also add `is_in_focus` to buddies for fast filtering on /browse.
-- ============================================================

-- focus_requests -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.focus_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled')),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_focus_requests_recipient_pending
  ON public.focus_requests(recipient_id, status) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_focus_requests_requester_pending
  ON public.focus_requests(requester_id, status) WHERE status = 'pending';

-- focus_sessions -----------------------------------------------------
CREATE TABLE IF NOT EXISTS public.focus_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES public.conversations(id) ON DELETE SET NULL,
  itinerary_id UUID REFERENCES public.itineraries(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  end_reason TEXT CHECK (end_reason IN ('completed', 'cancelled', 'timeout'))
);

CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_a_active
  ON public.focus_sessions(user_a_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_b_active
  ON public.focus_sessions(user_b_id) WHERE ended_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_a_history
  ON public.focus_sessions(user_a_id, ended_at DESC) WHERE ended_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_focus_sessions_user_b_history
  ON public.focus_sessions(user_b_id, ended_at DESC) WHERE ended_at IS NOT NULL;

-- buddies.is_in_focus ------------------------------------------------
ALTER TABLE public.buddies ADD COLUMN IF NOT EXISTS is_in_focus BOOLEAN DEFAULT false;

-- RLS ----------------------------------------------------------------
ALTER TABLE public.focus_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.focus_sessions ENABLE ROW LEVEL SECURITY;

-- focus_requests policies
DROP POLICY IF EXISTS "Users can see their own requests" ON public.focus_requests;
CREATE POLICY "Users can see their own requests"
  ON public.focus_requests FOR SELECT TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "Users can create focus requests" ON public.focus_requests;
CREATE POLICY "Users can create focus requests"
  ON public.focus_requests FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = requester_id);

DROP POLICY IF EXISTS "Users can update their own focus requests" ON public.focus_requests;
CREATE POLICY "Users can update their own focus requests"
  ON public.focus_requests FOR UPDATE TO authenticated
  USING (auth.uid() = requester_id OR auth.uid() = recipient_id);

-- focus_sessions policies
DROP POLICY IF EXISTS "Users can see their own focus sessions" ON public.focus_sessions;
CREATE POLICY "Users can see their own focus sessions"
  ON public.focus_sessions FOR SELECT TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

DROP POLICY IF EXISTS "Users can create focus sessions" ON public.focus_sessions;
CREATE POLICY "Users can create focus sessions"
  ON public.focus_sessions FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_a_id);

DROP POLICY IF EXISTS "Users can update their own focus sessions" ON public.focus_sessions;
CREATE POLICY "Users can update their own focus sessions"
  ON public.focus_sessions FOR UPDATE TO authenticated
  USING (auth.uid() = user_a_id OR auth.uid() = user_b_id);

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.focus_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.focus_sessions TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.focus_sessions TO service_role;

-- Realtime broadcasts (so chat header banner can subscribe)
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'focus_requests'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_requests;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'focus_sessions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.focus_sessions;
  END IF;
END $$;

-- Idempotency notes:
-- • CREATE TABLE IF NOT EXISTS — re-running is safe.
-- • DROP POLICY IF EXISTS + CREATE POLICY — re-applying updates the policy.
-- • ALTER TABLE ... ADD COLUMN IF NOT EXISTS — safe.
-- • GRANT is idempotent.
-- • Publication block uses IF NOT EXISTS via pg_publication_tables lookup.
-- ============================================================
