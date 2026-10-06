-- 2026-11-07-fix-collaborator-read-and-anon-grants.sql
--
-- Fix two issues:
--   A. `itineraries_collab_read` requires status='accepted', but the
--      invitee cannot read the itinerary UNTIL they accept — so they
--      can't even see the accept/decline banner. Loosen to invited OR
--      accepted.
--   B. `itinerary_share` is missing GRANT to anon role, so anonymous
--      reads of the share page fail with permission_denied.

-- A. Allow invited collaborators to read too
DROP POLICY IF EXISTS itineraries_collab_read ON public.itineraries;
CREATE POLICY itineraries_collab_read ON public.itineraries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itineraries.id
        AND c.user_id = auth.uid()
        AND c.status IN ('invited', 'accepted')
    )
  );

-- Same for days / stops / packing — invitees should be able to read
-- (no edit, so they can preview before accepting)
DROP POLICY IF EXISTS itinerary_days_collab_read ON public.itinerary_days;
CREATE POLICY itinerary_days_collab_read ON public.itinerary_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status IN ('invited', 'accepted')
    )
  );

DROP POLICY IF EXISTS itinerary_stops_collab_read ON public.itinerary_stops;
CREATE POLICY itinerary_stops_collab_read ON public.itinerary_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status IN ('invited', 'accepted')
    )
  );

DROP POLICY IF EXISTS itinerary_packing_collab_read ON public.itinerary_packing;
CREATE POLICY itinerary_packing_collab_read ON public.itinerary_packing
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status IN ('invited', 'accepted')
    )
  );

DROP POLICY IF EXISTS itinerary_activity_collab_read ON public.itinerary_activity;
CREATE POLICY itinerary_activity_collab_read ON public.itinerary_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_activity.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status IN ('invited', 'accepted')
    )
  );

-- B. Grant SELECT on itinerary_share to anon (public share links)
GRANT SELECT ON public.itinerary_share TO anon;