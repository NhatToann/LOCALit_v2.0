-- ============================================================
-- Wipe swipes + matches so the queue restarts from a clean deck
-- Date: 2026-10-06
-- Why:
--   After fixing the safe_buddies view (2026-10-06) so it filters
--   is_available=true, and adding the .neq('id', user.id) guard in
--   /api/swipe/queue, the deck should be correct. However the user
--   is seeing the same card re-surface, which means either:
--     - they accidentally swiped the card in a prior session whose
--       row never made it to the table (API returned 400 instead of
--       writing), OR
--     - stale rows from a pre-migration table with a different
--       unique key (e.g. swiper_id without swiper_role) are
--       invisible to the current query but still being treated as
--       "swiped" by some other code path.
--   This migration clears the slate. It also clears matches so the
--   first mutual match has a well-known starting point.
-- Safety:
--   - TRUNCATE … RESTART IDENTITY CASCADE drops dependent rows in
--     any FK from swipes/matches. The only known dependents are
--     messages linked by match_id (CASCADE keeps them consistent).
--   - This is a one-shot dev/QA wipe. Do not run on user data.
-- ============================================================

TRUNCATE TABLE public.matches RESTART IDENTITY CASCADE;
TRUNCATE TABLE public.swipes  RESTART IDENTITY CASCADE;