-- ============================================================
-- Swipe-to-Match flow
-- Date: 2026-10-06
-- Why: Product spec — Tourist swipes (Like/Pass) → Buddy notified →
-- Buddy Likes Back → Match → Chat. Implemented as two new tables
-- (swipes, matches) instead of overloading connections (which still
-- drives the existing Browse → Accept flow on /browse).
--
-- IMPORTANT: This file is idempotent and safe to re-run.
--   * Uses `gen_random_uuid()` (pgcrypto — enabled by Supabase) instead
--     of `uuid_generate_v4()` (uuid-ossp — NOT enabled on this project,
--     confirmed by inspecting the live schema).
--   * Every CREATE/DROP/ALTER/GRANT is guarded with IF EXISTS / IF NOT
--     EXISTS where possible, so re-applying on a partially-migrated DB
--     will not error out.
--   * Policies are dropped before being created (handles re-runs).
-- ============================================================

-- ------------------------------------------------------------
-- 1. swipes
--    One row per swipe action. Direction is either 'like' or
--    'pass'. A tourist liking a buddy creates a row; a buddy
--    liking a tourist back creates a separate row (different
--    swiper_role). The (swiper_role, swiper_id, target_id)
--    UNIQUE index makes accidental double-likes a no-op.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.swipes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  swiper_role text NOT NULL CHECK (swiper_role IN ('tourist','buddy')),
  swiper_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  target_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  direction   text NOT NULL CHECK (direction IN ('like','pass')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (swiper_role, swiper_id, target_id)
);

CREATE INDEX IF NOT EXISTS idx_swipes_target ON public.swipes(target_id, swiper_role, direction);
CREATE INDEX IF NOT EXISTS idx_swipes_swiper ON public.swipes(swiper_id, swiper_role, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_swipes_pair   ON public.swipes(swiper_id, target_id);

ALTER TABLE public.swipes ENABLE ROW LEVEL SECURITY;

-- Tourists see their own swipes; buddies see swipes targeted at them
-- (so a buddy can render "X liked you"). Writes are restricted to the
-- swiper themselves — no peer can manufacture a like on someone
-- else's behalf.
DROP POLICY IF EXISTS swipes_select_own ON public.swipes;
CREATE POLICY swipes_select_own ON public.swipes
  FOR SELECT TO authenticated
  USING (
    auth.uid() = swiper_id
    OR auth.uid() = target_id
  );

DROP POLICY IF EXISTS swipes_insert_own ON public.swipes;
CREATE POLICY swipes_insert_own ON public.swipes
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = swiper_id);

-- Allow updates only for owner (e.g. undo a pass → like). For this
-- release we keep swipes immutable; the UNIQUE + ON CONFLICT lets
-- the client upsert safely without this policy being needed, but
-- we leave the door open for "undo" UX.
DROP POLICY IF EXISTS swipes_update_own ON public.swipes;
CREATE POLICY swipes_update_own ON public.swipes
  FOR UPDATE TO authenticated
  USING (auth.uid() = swiper_id)
  WITH CHECK (auth.uid() = swiper_id);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'swipes'
  ) THEN
    GRANT SELECT, INSERT, UPDATE ON public.swipes TO authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2. matches
--    Created when a tourist LIKEs a buddy AND that buddy LIKEs
--    back. A trigger on swipes (see below) handles detection
--    so the client never has to race two INSERTs. conversation_id
--    is created lazily on first chat open (matches on the
--    existing UNIQUE(tourist_id, buddy_id) of public.conversations).
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.matches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tourist_id  uuid NOT NULL REFERENCES public.tourists(id) ON DELETE CASCADE,
  buddy_id    uuid NOT NULL REFERENCES public.buddies(id)  ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tourist_id, buddy_id)
);

CREATE INDEX IF NOT EXISTS idx_matches_tourist ON public.matches(tourist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_matches_buddy   ON public.matches(buddy_id,   created_at DESC);

ALTER TABLE public.matches ENABLE ROW LEVEL SECURITY;

-- Both participants can see their matches
DROP POLICY IF EXISTS matches_select_participants ON public.matches;
CREATE POLICY matches_select_participants ON public.matches
  FOR SELECT TO authenticated
  USING (auth.uid() = tourist_id OR auth.uid() = buddy_id);

-- Writes go through the trigger (SECURITY DEFINER) so anon/authenticated
-- clients can never fabricate a match. We still allow the trigger's
-- caller to insert by granting to authenticated — the trigger runs as
-- the function owner and bypasses RLS via SECURITY DEFINER.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE grantee = 'authenticated' AND table_schema = 'public' AND table_name = 'matches'
  ) THEN
    GRANT SELECT ON public.matches TO authenticated;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3. detect_match() — runs after every swipe insert.
--    Returns early unless the new swipe is a 'like' FROM a buddy
--    TO a tourist. Then it looks for the reverse 'like' (tourist
--    → buddy) created at any point in the past. If found, it
--    INSERTs a row into public.matches. ON CONFLICT makes the
--    operation idempotent (the unique index absorbs duplicates).
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.detect_match()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reverse_tourist_id uuid;
  v_reverse_buddy_id   uuid;
BEGIN
  -- Only fire on a buddy liking a tourist
  IF NEW.direction <> 'like' OR NEW.swiper_role <> 'buddy' THEN
    RETURN NEW;
  END IF;

  -- Look for the reverse like: tourist → buddy, direction='like'
  SELECT s.swiper_id
    INTO v_reverse_tourist_id
  FROM public.swipes s
  WHERE s.swiper_role  = 'tourist'
    AND s.swiper_id    = NEW.target_id        -- tourist is the target of the buddy's like
    AND s.target_id    = NEW.swiper_id        -- buddy is the target of the tourist's like
    AND s.direction    = 'like'
  LIMIT 1;

  IF v_reverse_tourist_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Make sure the tourist row really exists in public.tourists and
  -- the buddy row in public.buddies (FKs on matches would catch this
  -- but the explicit checks make the intent obvious).
  IF NOT EXISTS (SELECT 1 FROM public.tourists WHERE id = v_reverse_tourist_id) THEN
    RETURN NEW;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.buddies   WHERE id = NEW.swiper_id) THEN
    RETURN NEW;
  END IF;

  v_reverse_buddy_id := NEW.swiper_id;

  INSERT INTO public.matches (tourist_id, buddy_id)
  VALUES (v_reverse_tourist_id, v_reverse_buddy_id)
  ON CONFLICT (tourist_id, buddy_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_swipes_detect_match ON public.swipes;
CREATE TRIGGER trg_swipes_detect_match
  AFTER INSERT ON public.swipes
  FOR EACH ROW
  EXECUTE FUNCTION public.detect_match();

-- Realtime: clients (tourist + buddy) need live updates when a new
-- swipe arrives at them or a new match is created. The default
-- publication "supabase_realtime" already broadcasts changes to
-- authenticated clients when the table is added.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'swipes'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.swipes;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'matches'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.matches;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4. ensure_swipes_realtime_grants
--    Some Supabase projects strip table-level grants on the
--    publication; re-assert SELECT for the realtime role so the
--    channel actually receives events. Guarded so re-runs are safe.
-- ------------------------------------------------------------
GRANT SELECT ON public.swipes  TO authenticated;
GRANT SELECT ON public.matches TO authenticated;
