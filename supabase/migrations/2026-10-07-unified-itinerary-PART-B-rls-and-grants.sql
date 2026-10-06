-- =====================================================================
-- 2026-10-07-unified-itinerary-PART-B-rls-and-grants.sql
-- Run AFTER PART-A so all tables exist before policies reference them.
-- =====================================================================

ALTER TABLE public.itineraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_days ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_collaborators ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_packing ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_activity ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.itinerary_share ENABLE ROW LEVEL SECURITY;

-- Itineraries
CREATE POLICY itineraries_owner_all ON public.itineraries
  FOR ALL TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY itineraries_collab_read ON public.itineraries
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itineraries.id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

-- Collaborators
CREATE POLICY itinerary_collaborators_owner ON public.itinerary_collaborators
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_collaborators.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_collaborators.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_collaborators_self_read ON public.itinerary_collaborators
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
CREATE POLICY itinerary_collaborators_self_respond ON public.itinerary_collaborators
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Days
CREATE POLICY itinerary_days_owner ON public.itinerary_days
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_days.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_days.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_days_collab_read ON public.itinerary_days
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
CREATE POLICY itinerary_days_collab_write ON public.itinerary_days
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_days.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  );

-- Stops (same pattern)
CREATE POLICY itinerary_stops_owner ON public.itinerary_stops
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_stops.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_stops.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_stops_collab_read ON public.itinerary_stops
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
CREATE POLICY itinerary_stops_collab_write ON public.itinerary_stops
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_stops.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  );

-- Packing
CREATE POLICY itinerary_packing_owner ON public.itinerary_packing
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_packing.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_packing.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_packing_collab_read ON public.itinerary_packing
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );
CREATE POLICY itinerary_packing_collab_write ON public.itinerary_packing
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_packing.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
        AND c.role IN ('owner', 'editor')
    )
  );

-- Activity
CREATE POLICY itinerary_activity_owner ON public.itinerary_activity
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_activity.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_activity.itinerary_id AND i.owner_id = auth.uid()
    )
  );
CREATE POLICY itinerary_activity_collab_read ON public.itinerary_activity
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itinerary_collaborators c
      WHERE c.itinerary_id = itinerary_activity.itinerary_id
        AND c.user_id = auth.uid()
        AND c.status = 'accepted'
    )
  );

-- Bookmarks
CREATE POLICY itinerary_bookmarks_owner ON public.itinerary_bookmarks
  FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Share
CREATE POLICY itinerary_share_read ON public.itinerary_share
  FOR SELECT TO anon, authenticated
  USING (enabled = true);
CREATE POLICY itinerary_share_owner ON public.itinerary_share
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_share.itinerary_id AND i.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.itineraries i
      WHERE i.id = itinerary_share.itinerary_id AND i.owner_id = auth.uid()
    )
  );

-- Triggers
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;
CREATE TRIGGER itineraries_updated_at BEFORE UPDATE ON public.itineraries FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER itinerary_days_updated_at BEFORE UPDATE ON public.itinerary_days FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER itinerary_stops_updated_at BEFORE UPDATE ON public.itinerary_stops FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER itinerary_packing_updated_at BEFORE UPDATE ON public.itinerary_packing FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- View
CREATE OR REPLACE VIEW public.safe_itineraries AS
SELECT
  i.id, i.title, i.destination, i.start_date, i.end_date, i.status,
  i.visibility, i.meetup_point, i.created_at, i.updated_at,
  p.id AS owner_id, p.full_name AS owner_name, p.avatar_url AS owner_avatar
FROM public.itineraries i
JOIN public.profiles p ON p.id = i.owner_id;
GRANT SELECT ON public.safe_itineraries TO anon, authenticated;

-- Grants
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.itineraries,
     public.itinerary_days,
     public.itinerary_stops,
     public.itinerary_collaborators,
     public.itinerary_packing,
     public.itinerary_activity,
     public.itinerary_bookmarks,
     public.itinerary_share
  TO authenticated, service_role;
