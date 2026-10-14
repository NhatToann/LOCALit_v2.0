-- =====================================================================
-- 2026-10-10 — Profile reviews (no trip required)
-- =====================================================================
-- WHY
-- ---
-- `public.reviews` shipped with `trip_id UUID NOT NULL REFERENCES
-- public.trips(id) ON DELETE CASCADE`. The 2026-10-07 unified-itinerary
-- migration dropped `public.trips` CASCADE, which silently dropped the
-- FK and left `trip_id` as an orphan NOT NULL column pointing at nothing.
--
-- The consequences were:
--   1. Nobody could write a review. The only policy was
--      `"Reviews visible to everyone"` (SELECT). There was no INSERT
--      policy at all, so the feature was read-only forever.
--   2. Even with an INSERT policy, the old one required an EXISTS
--      check against `public.trips` — a table that no longer exists.
--   3. A profile page could never be reviewed, because a review
--      conceptually needs no trip: it needs the two people to have
--      actually met.
--
-- WHAT THIS DOES
-- -------------
-- 1. Makes `trip_id` NULLABLE (it is already FK-less after the drop,
--    so this is a pure NOT NULL removal, not a constraint swap).
-- 2. Adds `connection_id UUID REFERENCES public.connections(id)
--    ON DELETE SET NULL` — the evidence that the two people actually
--    connected. Kept separate from trip_id so the old column can
--    still be written by any legacy caller.
-- 3. Replaces the missing INSERT policy with one that enforces the
--    product rule chosen on 2026-10-10: **you may only review
--    someone you have an accepted connection with.** That is the
--    anti-spam gate — a random anonymous user cannot pile fake 5-star
--    reviews onto a profile.
-- 4. Adds the matching DELETE policy so a reviewer can retract their
--    own review, and an UPDATE policy so a reviewer can edit it.
-- 5. Adds a UNIQUE index on (reviewer_id, reviewee_id) so one person
--    can leave exactly one review per profile — updating it in place
--    instead of stacking duplicates.
--
-- The INSERT policy deliberately reads `requester_id` / `recipient_id`
-- rather than `tourist_id` / `buddy_id`: per the 2026-11-07 connection
-- migration those two columns are denormalized legacy fallbacks, while
-- requester_id/recipient_id are the source of truth and are populated
-- on every row written by the current app.
--
-- Idempotent: safe to re-run.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. trip_id: NOT NULL -> NULL
-- ---------------------------------------------------------------------
-- Already FK-less (public.trips is gone), so DROP NOT NULL is enough.
-- Guarded so a re-run is a no-op instead of an error.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews'
      AND column_name = 'trip_id' AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE public.reviews ALTER COLUMN trip_id DROP NOT NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. connection_id — the "we actually met" evidence
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'reviews'
      AND column_name = 'connection_id'
  ) THEN
    ALTER TABLE public.reviews
      ADD COLUMN connection_id UUID REFERENCES public.connections(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 3. One review per reviewer per reviewee
-- ---------------------------------------------------------------------
-- Without this a user could edit-and-insert repeatedly and inflate a
-- rating. With it, the "edit" path is an UPDATE on the same row.
CREATE UNIQUE INDEX IF NOT EXISTS reviews_reviewer_reviewee_uniq
  ON public.reviews (reviewer_id, reviewee_id);

-- Drop the old non-unique reviewee index — the unique one above is
-- prefixed by reviewer so it does NOT cover `WHERE reviewee_id = ?`
-- lookups on their own.
CREATE INDEX IF NOT EXISTS idx_reviews_reviewee_created
  ON public.reviews (reviewee_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 4. RLS policies
-- ---------------------------------------------------------------------
-- SELECT stays open (the existing "Reviews visible to everyone" policy
-- is fine — reviews are public by definition and the reviewer_id join
-- goes through safe_profiles, never profiles directly).

-- INSERT: reviewer is you, reviewee is not you, and you two have an
-- accepted connection. Written as a single EXISTS over connections
-- using requester_id/recipient_id (the source of truth).
DROP POLICY IF EXISTS "Participants can create reviews" ON public.reviews;
DROP POLICY IF EXISTS "reviews_insert" ON public.reviews;

CREATE POLICY reviews_insert ON public.reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid() = reviewer_id
    AND reviewer_id <> reviewee_id
    AND EXISTS (
      SELECT 1
      FROM public.connections c
      WHERE c.status = 'accepted'
        AND (
          (c.requester_id = auth.uid() AND c.recipient_id = reviewee_id)
          OR (c.recipient_id = auth.uid() AND c.requester_id = reviewee_id)
        )
    )
  );

-- UPDATE: you may edit your own review (the unique index above means
-- this is the "change my rating" path, not an append-a-new-one path).
DROP POLICY IF EXISTS "reviews_update" ON public.reviews;

CREATE POLICY reviews_update ON public.reviews
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = reviewer_id)
  WITH CHECK (auth.uid() = reviewer_id);

-- DELETE: you may retract your own review.
DROP POLICY IF EXISTS "reviews_delete" ON public.reviews;

CREATE POLICY reviews_delete ON public.reviews
  FOR DELETE
  TO authenticated
  USING (auth.uid() = reviewer_id);

-- ---------------------------------------------------------------------
-- 5. Grants
-- ---------------------------------------------------------------------
-- The table grants already exist (verified 2026-10-10: INSERT/UPDATE/
-- DELETE/SELECT are granted to both anon and authenticated). Re-grant
-- defensively in case a future schema re-run strips them — this is the
-- exact failure mode recorded in AGENTS.md for service_role, and the
-- same applies here.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO authenticated;
GRANT SELECT ON public.reviews TO anon;

-- service_role bypasses RLS but still needs table-level privileges.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.reviews TO service_role;