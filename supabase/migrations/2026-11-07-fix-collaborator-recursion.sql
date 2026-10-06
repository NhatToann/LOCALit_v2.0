-- 2026-11-07-fix-collaborator-recursion.sql
--
-- Fix: infinite recursion between itinerary_collaborators_owner and
-- itineraries_collab_read policies.
--
-- Recursion path:
--   itineraries_collab_read
--     -> SELECT FROM itinerary_collaborators
--     -> itinerary_collaborators_owner USING (SELECT FROM itineraries)
--     -> itineraries_collab_read  (loop)
--
-- Fix: replace policy USING expressions on `itinerary_collaborators`
-- (and the dependent ones that touch `itineraries`) with calls to a
-- SECURITY DEFINER helper that bypasses RLS. The helper only consults
-- `auth.uid()` and `itineraries.owner_id` (no recursion because the
-- function itself runs as the function owner, not the caller).
--
-- After this migration:
--   itineraries_owner_all           (single, no recursion)
--   itineraries_collab_read         (single, no recursion)
--   itinerary_collaborators_owner   (uses helper fn)
--   itinerary_collaborators_self_read (no change)
--   itinerary_collaborators_self_respond (no change)
--   itinerary_days_owner            (uses helper fn)
--   itinerary_days_collab_read/write (no change)
--   itinerary_stops_owner           (uses helper fn)
--   itinerary_stops_collab_read/write (no change)
--   itinerary_packing_owner         (uses helper fn)
--   itinerary_packing_collab_read/write (no change)
--   itinerary_activity_owner        (uses helper fn)
--   itinerary_activity_collab_read (no change)

CREATE OR REPLACE FUNCTION public.is_itinerary_owner(p_itinerary_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.itineraries
    WHERE id = p_itinerary_id AND owner_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_itinerary_owner(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_itinerary_owner(uuid) TO authenticated, anon;

-- itinerary_collaborators: owner policy
DROP POLICY IF EXISTS itinerary_collaborators_owner ON public.itinerary_collaborators;
CREATE POLICY itinerary_collaborators_owner ON public.itinerary_collaborators
  FOR ALL TO authenticated
  USING (public.is_itinerary_owner(itinerary_id))
  WITH CHECK (public.is_itinerary_owner(itinerary_id));

-- itinerary_days: owner policy
DROP POLICY IF EXISTS itinerary_days_owner ON public.itinerary_days;
CREATE POLICY itinerary_days_owner ON public.itinerary_days
  FOR ALL TO authenticated
  USING (public.is_itinerary_owner(itinerary_id))
  WITH CHECK (public.is_itinerary_owner(itinerary_id));

-- itinerary_stops: owner policy
DROP POLICY IF EXISTS itinerary_stops_owner ON public.itinerary_stops;
CREATE POLICY itinerary_stops_owner ON public.itinerary_stops
  FOR ALL TO authenticated
  USING (public.is_itinerary_owner(itinerary_id))
  WITH CHECK (public.is_itinerary_owner(itinerary_id));

-- itinerary_packing: owner policy
DROP POLICY IF EXISTS itinerary_packing_owner ON public.itinerary_packing;
CREATE POLICY itinerary_packing_owner ON public.itinerary_packing
  FOR ALL TO authenticated
  USING (public.is_itinerary_owner(itinerary_id))
  WITH CHECK (public.is_itinerary_owner(itinerary_id));

-- itinerary_activity: owner policy
DROP POLICY IF EXISTS itinerary_activity_owner ON public.itinerary_activity;
CREATE POLICY itinerary_activity_owner ON public.itinerary_activity
  FOR ALL TO authenticated
  USING (public.is_itinerary_owner(itinerary_id))
  WITH CHECK (public.is_itinerary_owner(itinerary_id));

-- itinerary_share: owner policy
DROP POLICY IF EXISTS itinerary_share_owner ON public.itinerary_share;
CREATE POLICY itinerary_share_owner ON public.itinerary_share
  FOR ALL TO authenticated
  USING (public.is_itinerary_owner(itinerary_id))
  WITH CHECK (public.is_itinerary_owner(itinerary_id));