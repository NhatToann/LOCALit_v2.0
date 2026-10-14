-- Fix: connection notifications always linked to /buddies/<actorId>,
-- even when the actor is a tourist.
--
-- WHY (2026-10-10)
-- The 2026-10-01 flat-URL migration retired /tourist/* and /buddy/* and
-- kept /buddies/<id> + /tourists/<id>. This trigger still hardcoded
-- '/buddies/' for the ACTOR:
--
--     '/buddies/' || COALESCE(NEW.requester_id, NEW.tourist_id)::text
--
-- So a buddy receiving a request from a tourist got
--     /buddies/f2df98b0-...   <- f2df98b0 is a TOURIST
-- which 404s, so tapping "View and respond" did nothing. Reported by the
-- user as notifications that cannot be tapped.
--
-- The link must follow the ACTOR's actual role.

CREATE OR REPLACE FUNCTION public.notify_on_connection()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  actor_name  TEXT;
  actor_id    UUID;
  actor_role  TEXT;
  recipient_id UUID;
  actor_link  TEXT;
BEGIN
  actor_id := COALESCE(NEW.requester_id, NEW.tourist_id);

  -- The 'requester_id' is the column we trust (set by the API). If it's
  -- null we fall back to tourist_id for legacy rows.
  IF NEW.requester_id IS NOT NULL THEN
    recipient_id := NEW.recipient_id;
  ELSE
    recipient_id := NEW.buddy_id;
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles WHERE id = actor_id;
  IF actor_name IS NULL THEN actor_name := 'Someone'; END IF;

  -- The profile route depends on the actor's role. Hardcoding '/buddies/'
  -- sends tourists to a 404. Derive it instead.
  SELECT role::text INTO actor_role FROM public.profiles WHERE id = actor_id;
  actor_link := CASE
    WHEN actor_role = 'tourist' THEN '/tourists/' || actor_id::text
    ELSE '/buddies/' || actor_id::text
  END;

  -- New request (INSERT or status changed from non-pending -> pending).
  -- Compare via NEW.status::text to dodge the enum-cast failure seen
  -- on some Postgres builds (path: invalid input value for enum
  -- connection_status: "").
  IF TG_OP = 'INSERT' OR (TG_OP = 'UPDATE' AND NEW.status::text = 'pending'
                           AND COALESCE(OLD.status::text, '') <> 'pending') THEN
    INSERT INTO public.notifications
      (user_id, type, title, body, link, actor_id, actor_name)
    VALUES (
      recipient_id,
      'connection_request',
      actor_name || ' wants to connect',
      COALESCE(LEFT(NEW.message, 120), 'Tap to review and respond.'),
      actor_link,
      actor_id,
      actor_name
    );
  END IF;

  -- Status changed to accepted/declined -> notify the requester.
  IF TG_OP = 'UPDATE'
     AND (NEW.status::text = 'accepted' OR NEW.status::text = 'declined')
     AND COALESCE(OLD.status::text, '') <> NEW.status::text THEN
    -- recipient_id is the person who accepted/declined, so THEY are the
    -- actor from the requester's point of view.
    SELECT role::text INTO actor_role FROM public.profiles WHERE id = recipient_id;
    actor_link := CASE
      WHEN actor_role = 'tourist' THEN '/tourists/' || recipient_id::text
      ELSE '/buddies/' || recipient_id::text
    END;

    INSERT INTO public.notifications
      (user_id, type, title, body, link, actor_id, actor_name)
    VALUES (
      actor_id,
      CASE NEW.status::text
        WHEN 'accepted' THEN 'connection_accepted'
        ELSE 'connection_declined'
      END,
      CASE NEW.status::text
        WHEN 'accepted' THEN actor_name || ' accepted your connection'
        ELSE actor_name || ' declined your connection'
      END,
      CASE NEW.status::text
        WHEN 'accepted' THEN 'You can now chat and plan a trip.'
        ELSE 'You can send a new request from their profile.'
      END,
      actor_link,
      recipient_id,
      actor_name
    );
  END IF;

  RETURN NEW;
END;
$function$;

-- Repoint existing rows that were written with the wrong prefix.
-- Only touch links that currently point at a profile of the OTHER role,
-- so genuinely-correct rows are left untouched.
UPDATE public.notifications n
SET link = '/tourists/' || n.actor_id::text
FROM public.profiles p
WHERE n.actor_id = p.id
  AND p.role = 'tourist'
  AND n.link = '/buddies/' || n.actor_id::text;

UPDATE public.notifications n
SET link = '/buddies/' || n.actor_id::text
FROM public.profiles p
WHERE n.actor_id = p.id
  AND p.role = 'buddy'
  AND n.link = '/tourists/' || n.actor_id::text;

COMMENT ON FUNCTION public.notify_on_connection() IS
  'Creates connection notifications. Link follows the ACTOR real role so a request from a tourist links to /tourists/<id>, not /buddies/<id>.';