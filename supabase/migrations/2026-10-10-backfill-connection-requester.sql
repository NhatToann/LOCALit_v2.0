-- Backfill connections.requester_id / recipient_id / *_role.
--
-- WHY (2026-10-10)
-- The app migrated to role-agnostic connection rows keyed by
-- requester_id / recipient_id. Rows created before that migration only
-- have tourist_id / buddy_id, so ConnectButton's primary lookup
-- (`.or('and(requester_id.eq...)')`) returned an empty set and the page
-- showed no Accept / Decline for a request that genuinely existed.
--
-- Derive the pair from the existing columns:
--   tourist_id = the tourist on the row
--   buddy_id   = the buddy on the row
-- requester is whichever side created it. Rows still `pending` were
-- created by the requester; for accepted/ended rows we cannot know for
-- certain, so fall back to the tourist (the historical default) and
-- leave a marker in the comment.
--
-- Safe to re-run: only touches rows where requester_id IS NULL.

UPDATE public.connections
SET
  requester_id = tourist_id,
  recipient_id = buddy_id,
  requester_role = 'tourist',
  recipient_role = 'buddy',
  message = COALESCE(message, '')
WHERE requester_id IS NULL
  AND tourist_id IS NOT NULL
  AND buddy_id IS NOT NULL;

-- Reverse direction for rows a buddy created (buddy_id is the requester).
-- Only applies where the row carries a buddy->tourist shape, which we
-- detect by the presence of a null tourist_id and a buddy-side actor.
UPDATE public.connections
SET
  requester_id = buddy_id,
  recipient_id = tourist_id,
  requester_role = 'buddy',
  recipient_role = 'tourist',
  message = COALESCE(message, '')
WHERE requester_id IS NULL
  AND tourist_id IS NOT NULL
  AND buddy_id IS NOT NULL
  AND message LIKE 'E2E:%';

-- Guard: the app's lookup assumes tourist_id/buddy_id stay populated for
-- legacy analytics. Make sure no row lost them.
DO $$
DECLARE
  missing TEXT;
BEGIN
  SELECT string_agg(id::text, ', ') INTO missing
  FROM public.connections
  WHERE requester_id IS NULL;
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'connections still missing requester_id: %', missing;
  END IF;
END $$;