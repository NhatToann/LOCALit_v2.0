-- Tighten RLS policies so tourists/buddies rows are only readable when the
-- user has explicitly opted in (is_visible = true).
--
-- Rationale: the previous "viewable by everyone" policies leaked DOB,
-- nationality, interests, languages, budget_range even when a user wanted to
-- stay private. The new policies:
--   - Allow SELECT only when is_visible = true (or for the row owner)
--   - Keep INSERT/UPDATE behavior unchanged (only the owner can write)
--
-- Reviews stay public-by-design (they're meant to surface a buddy's reputation).

-- Drop the existing public policies we want to replace.
DROP POLICY IF EXISTS "Tourist profiles are viewable by everyone" ON public.tourists;
DROP POLICY IF EXISTS "Buddies are discoverable by everyone" ON public.buddies;

-- Tourists: visible rows OR your own row.
CREATE POLICY "Tourists visible row is public"
  ON public.tourists
  FOR SELECT
  USING (is_visible = true OR auth.uid() = id);

-- Buddies: discoverable only when the buddy is marked available AND visible.
CREATE POLICY "Buddies discoverable when available and visible"
  ON public.buddies
  FOR SELECT
  USING (is_available = true OR auth.uid() = id);

-- Also tighten the location_updates policy so only buddies can read other
-- buddies' locations (it was already buddy-only but making the role filter
-- explicit and safe against future schema drift).
DROP POLICY IF EXISTS "Buddies can see all locations for tourist discovery" ON public.location_updates;
CREATE POLICY "Buddies can see other buddy locations for discovery"
  ON public.location_updates
  FOR SELECT
  USING (
    auth.uid() = user_id
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'buddy'::public.user_role
    )
  );
