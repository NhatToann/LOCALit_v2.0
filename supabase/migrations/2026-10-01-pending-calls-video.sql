-- 2026-10-01 — Extend pending_calls for voice + video calls
-- Background: the 2026-09-28 schema only handled voice calls. The
-- migration adds:
--   * room_name TEXT — so the callee can join the right LiveKit room
--     (was previously encoded in `conversation_id` indirectly via
--     `call:<convId>`, but explicit is better and lets us add 1:1
--     calls later that don't have a conversation row).
--   * type TEXT CHECK ('voice','video') — drives the UI affordances
--     on both the calling side (button to press) and the receiving
--     side (Phone vs Video icon in the popup).
--   * changed expires_at default from 45s to 30s per the new spec.
--   * added 'ended' to the status CHECK (was previously 'cancelled'/
--     'expired'/'declined'/'missed'/'accepted'/'ringing' — callers
--     now write 'ended' explicitly when they hang up).
--
-- This migration is idempotent: every ALTER is wrapped in a DO
-- block that checks pg_attribute / pg_constraint before changing.

-- 1. Add room_name column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.pending_calls'::regclass
      AND attname = 'room_name'
  ) THEN
    ALTER TABLE public.pending_calls ADD COLUMN room_name TEXT;
  END IF;
END
$$;

-- 2. Backfill room_name for any existing ringing rows (none expected
-- in production but defensive). The convention is `call:<convId>`.
UPDATE public.pending_calls
   SET room_name = 'call:' || conversation_id::text
 WHERE room_name IS NULL;

-- 3. Make room_name NOT NULL after backfill
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.pending_calls'::regclass
      AND attname = 'room_name'
      AND attnotnull = false
  ) THEN
    ALTER TABLE public.pending_calls
      ALTER COLUMN room_name SET NOT NULL;
  END IF;
END
$$;

-- 4. Add type column with default 'voice'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_attribute
    WHERE attrelid = 'public.pending_calls'::regclass
      AND attname = 'type'
  ) THEN
    ALTER TABLE public.pending_calls
      ADD COLUMN type TEXT NOT NULL DEFAULT 'voice'
      CHECK (type IN ('voice', 'video'));
  END IF;
END
$$;

-- 5. Add 'ended' to the status CHECK constraint
DO $$
DECLARE
  constraint_rec RECORD;
BEGIN
  FOR constraint_rec IN
    SELECT conname
      FROM pg_constraint
     WHERE conrelid = 'public.pending_calls'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) LIKE '%status%'
  LOOP
    EXECUTE format('ALTER TABLE public.pending_calls DROP CONSTRAINT %I', constraint_rec.conname);
  END LOOP;
  ALTER TABLE public.pending_calls
    ADD CONSTRAINT pending_calls_status_check
    CHECK (status IN ('ringing', 'accepted', 'declined', 'missed', 'cancelled', 'expired', 'ended'));
END
$$;

-- 6. Change expires_at default from 45s to 30s
ALTER TABLE public.pending_calls
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '30 seconds');

-- 7. Index for the (callee, status, expires_at) pattern that the
-- incoming watcher uses
CREATE INDEX IF NOT EXISTS idx_pending_calls_callee_status_expires
  ON public.pending_calls(callee_id, status, expires_at);

-- 8. Document the new columns
COMMENT ON COLUMN public.pending_calls.room_name IS
  'LiveKit room identifier, format call:<conversationId> or call:dm:<userA>:<userB>';
COMMENT ON COLUMN public.pending_calls.type IS
  'Call kind — drives UI affordances (audio-only vs video tile).';
