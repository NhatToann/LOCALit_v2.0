-- Fix: keep public.conversations.last_message_at / last_message_preview /
-- last_message_sender_id in sync with public.messages at the DATABASE level.
--
-- Why this is needed (2026-10-10):
--   /chat renders the conversation sidebar from the DENORMALIZED
--   last_message_* columns, not from a join over messages. Those
--   columns were only ever written by the client that SENT the
--   message (app/chat/page.tsx, on send + on shared-location).
--   Consequences before this trigger existed:
--     - A message inserted by any other path (focus request, focus
--       end, call-log, a second tab, a failed client update, an API
--       route) left the row stale forever.
--     - The sender saw their own message instantly; the RECIPIENT
--       reloaded and the sidebar still read "Start chatting".
--     - Verified: conv e0d4aadd had 21 messages with
--       last_message_at = NULL.
--
-- This trigger makes the denormalized columns authoritative from the
-- database, so every write path (client, API route, realtime, admin
-- script, cron) is covered without touching application code.

CREATE OR REPLACE FUNCTION public.sync_conversation_last_message()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
BEGIN
  UPDATE public.conversations AS c
  SET last_message_at    = NEW.created_at,
      last_message_preview = left(NEW.content, 200),
      updated_at          = now()
  WHERE c.id = NEW.conversation_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_conversation_last_message ON public.messages;

CREATE TRIGGER trg_sync_conversation_last_message
AFTER INSERT ON public.messages
FOR EACH ROW
EXECUTE FUNCTION public.sync_conversation_last_message();


-- Backfill: repair every conversation that drifted, then report.
DO $$
DECLARE
  fixed_count integer;
BEGIN
  WITH latest AS (
    SELECT DISTINCT ON (m.conversation_id)
           m.conversation_id,
           m.created_at,
           m.content,
           m.sender_id
    FROM public.messages m
    WHERE m.deleted_at IS NULL
    ORDER BY m.conversation_id, m.created_at DESC
  )
  UPDATE public.conversations c
  SET last_message_at      = l.created_at,
      last_message_preview = left(l.content, 200),
      updated_at           = now()
  FROM latest l
  WHERE c.id = l.conversation_id
    AND (c.last_message_at IS DISTINCT FROM l.created_at);

  GET DIAGNOSTICS fixed_count = ROW_COUNT;
  RAISE NOTICE 'Backfilled % conversation(s)', fixed_count;
END;
$$;