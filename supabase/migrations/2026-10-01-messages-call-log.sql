-- 2026-10-01: messages.kind + messages.meta columns for call-log entries.
--
-- The voice/video-call UX (call-flow spec 2026-10-01) requires every
-- call to drop a "call-log" entry into the conversation thread so both
-- sides see "Voice call · 02:45" or "Missed voice call" without
-- scrolling through system notifications.
--
-- We add two columns:
--   - kind text NULL    — default NULL = normal text bubble.
--                         'call_log' = synthetic row, render with the
--                         CallLogMessage component instead of the
--                         Markdown bubble.
--   - meta jsonb NULL   — payload for the synthetic row (callId,
--                         mode, outcome, durationSeconds, partnerId,
--                         isOutgoing). Stored as jsonb so future call
--                         types (group call, screen-share) can extend
--                         without further migrations.
--
-- Both columns are nullable to preserve back-compat with the existing
-- ~9 messages in production (no row rewrites required).

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS kind text NULL,
  ADD COLUMN IF NOT EXISTS meta jsonb NULL;

-- The kind column is a small closed set today; CHECK keeps the data
-- clean even if a buggy client sends a typo. NULL is always allowed
-- (normal text bubble).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.constraint_column_usage
    WHERE table_name = 'messages'
      AND constraint_name = 'messages_kind_check'
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_kind_check
      CHECK (kind IS NULL OR kind IN ('call_log'));
  END IF;
END$$;

-- Index for fast lookups by kind. The chat list may want to render
-- call-log rows differently than text rows; an index on the column
-- lets the renderer filter cheaply.
CREATE INDEX IF NOT EXISTS idx_messages_kind
  ON public.messages (kind)
  WHERE kind IS NOT NULL;

COMMENT ON COLUMN public.messages.kind IS
  'Synthetic row marker. NULL = normal text bubble. "call_log" = synthetic call-log entry; see messages.meta for payload.';
COMMENT ON COLUMN public.messages.meta IS
  'Payload for synthetic messages (kind = call_log). JSON shape varies by kind.';