-- ============================================================
-- 2026-10-09: Add focus notification types
-- ============================================================
-- The original focus-mode migration referenced notification_type
-- enum values that need to exist before /api/focus/* can write
-- notification rows. ALTER TYPE ... ADD VALUE is non-transactional
-- in some PG versions, so we run it in its own migration to be
-- safe.
--
-- Three new values:
--   focus_request   — sent to recipient when a focus request is created
--   focus_accepted  — sent to requester when recipient accepts
--   focus_declined  — sent to requester when recipient declines
-- ============================================================

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'focus_request'
      AND enumtypid = 'notification_type'::regtype
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'focus_request';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'focus_accepted'
      AND enumtypid = 'notification_type'::regtype
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'focus_accepted';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'focus_declined'
      AND enumtypid = 'notification_type'::regtype
  ) THEN
    ALTER TYPE notification_type ADD VALUE 'focus_declined';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- ALTER TYPE ADD VALUE has restrictions in transactions. If we hit
  -- "ALTER TYPE ... ADD cannot run inside a transaction block", the
  -- migration runner will need to apply this with autocommit on.
  RAISE NOTICE 'Could not add focus notification types: %', SQLERRM;
END $$;
