-- ============================================================
-- CHAT V2 — Reactions, read receipts, attachments, calls
-- Adds: message_reactions, call_logs, call_signals,
--       message_type/reply_to/edited_at/deleted_at/metadata,
--       conversation read-receipt + typing cursors.
-- See plan in chat history: B1.
-- ============================================================

-- 1) Expand messages: type, reply, edit, delete, metadata
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS message_type TEXT NOT NULL DEFAULT 'text'
    CHECK (message_type IN ('text','image','file','location','system')),
  ADD COLUMN IF NOT EXISTS reply_to_id UUID REFERENCES public.messages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS edited_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_messages_reply_to ON public.messages(reply_to_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation_created
  ON public.messages(conversation_id, created_at DESC);

GRANT ALL ON public.messages TO service_role;

-- 2) message_reactions — emoji tapbacks
CREATE TABLE IF NOT EXISTS public.message_reactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  emoji TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (message_id, user_id, emoji)
);
CREATE INDEX IF NOT EXISTS idx_message_reactions_message ON public.message_reactions(message_id);

ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "reactions visible to conversation participants" ON public.message_reactions;
CREATE POLICY "reactions visible to conversation participants"
  ON public.message_reactions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id
        AND (auth.uid() = c.tourist_id OR auth.uid() = c.buddy_id)
    )
  );

DROP POLICY IF EXISTS "users add own reactions" ON public.message_reactions;
CREATE POLICY "users add own reactions"
  ON public.message_reactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.conversations c ON c.id = m.conversation_id
      WHERE m.id = message_id
        AND (auth.uid() = c.tourist_id OR auth.uid() = c.buddy_id)
    )
  );

DROP POLICY IF EXISTS "users remove own reactions" ON public.message_reactions;
CREATE POLICY "users remove own reactions"
  ON public.message_reactions FOR DELETE
  USING (auth.uid() = user_id);

GRANT ALL ON public.message_reactions TO authenticated;
GRANT ALL ON public.message_reactions TO service_role;

-- 3) Conversation: read-receipt + typing cursors + last_message preview
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS last_read_at_by_tourist TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_read_at_by_buddy TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_message_preview TEXT,
  ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS typing_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS typing_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pinned_message_id UUID REFERENCES public.messages(id) ON DELETE SET NULL;

GRANT ALL ON public.conversations TO service_role;

-- 4) call_logs
CREATE TABLE IF NOT EXISTS public.call_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  caller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  call_type TEXT NOT NULL CHECK (call_type IN ('voice','video')),
  status TEXT NOT NULL DEFAULT 'initiated'
    CHECK (status IN ('initiated','ringing','accepted','declined','missed','ended','failed')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  answered_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER
);
CREATE INDEX IF NOT EXISTS idx_call_logs_conv ON public.call_logs(conversation_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_caller ON public.call_logs(caller_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_logs_callee ON public.call_logs(callee_id, started_at DESC);

ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "call_logs visible to participants" ON public.call_logs;
CREATE POLICY "call_logs visible to participants"
  ON public.call_logs FOR SELECT
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

DROP POLICY IF EXISTS "caller can insert log" ON public.call_logs;
CREATE POLICY "caller can insert log"
  ON public.call_logs FOR INSERT
  WITH CHECK (auth.uid() = caller_id);

DROP POLICY IF EXISTS "participants can update log" ON public.call_logs;
CREATE POLICY "participants can update log"
  ON public.call_logs FOR UPDATE
  USING (auth.uid() = caller_id OR auth.uid() = callee_id);

GRANT ALL ON public.call_logs TO authenticated;
GRANT ALL ON public.call_logs TO service_role;

-- 5) call_signals — WebRTC signaling (offer/answer/ICE/bye)
CREATE TABLE IF NOT EXISTS public.call_signals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  call_log_id UUID NOT NULL REFERENCES public.call_logs(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  signal_type TEXT NOT NULL CHECK (signal_type IN ('offer','answer','ice','bye','busy')),
  payload JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_call_signals_call ON public.call_signals(call_log_id, created_at);
CREATE INDEX IF NOT EXISTS idx_call_signals_recipient ON public.call_signals(recipient_id, created_at DESC);

ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "participants can read signals" ON public.call_signals;
CREATE POLICY "participants can read signals"
  ON public.call_signals FOR SELECT
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

DROP POLICY IF EXISTS "sender can insert signal" ON public.call_signals;
CREATE POLICY "sender can insert signal"
  ON public.call_signals FOR INSERT
  WITH CHECK (auth.uid() = sender_id);

DROP POLICY IF EXISTS "participants can delete signals after read" ON public.call_signals;
CREATE POLICY "participants can delete signals after read"
  ON public.call_signals FOR DELETE
  USING (auth.uid() = sender_id OR auth.uid() = recipient_id);

GRANT ALL ON public.call_signals TO authenticated;
GRANT ALL ON public.call_signals TO service_role;

-- 6) Realtime publication: make sure new tables are broadcast
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'messages';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.messages';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'message_reactions';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'conversations';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'call_logs';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'call_signals';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.call_signals';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_days';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_days';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_stops';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_stops';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_bookings';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_bookings';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_budget';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_budget';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_packing_items';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_packing_items';
  END IF;

  PERFORM 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'trip_activity';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trip_activity';
  END IF;
END $$;
