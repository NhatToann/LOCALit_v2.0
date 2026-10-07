-- 2026-11-07-notifications.sql
--
-- Adds a unified notification feed to LOCALit. Three event sources
-- push rows here:
--
--   1. New message in a conversation the user is a participant of.
--   2. Connection request created (recipient notified).
--   3. Connection request accepted/declined (requester notified).
--
-- The React app subscribes to realtime on this table and renders a
-- bell + unread badge in the header. Clicking a notification marks
-- it read and navigates to the related link.

CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN (
                'message',
                'connection_request',
                'connection_accepted',
                'connection_declined',
                'trip_update'
              )),
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name  TEXT,                  -- denormalized at write time so the
                                     -- bell can render even if the actor
                                     -- row is later redacted.
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON public.notifications (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread
  ON public.notifications (user_id)
  WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Without these table-level grants, the 'authenticated' role gets
-- "permission denied for table notifications" even when RLS passes.
-- (RLS only filters rows; the role still needs base SELECT/INSERT/UPDATE
-- permission on the table to talk to it.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications
  TO anon, authenticated;

-- Users can read their own notifications
DROP POLICY IF EXISTS notifications_select_own ON public.notifications;
CREATE POLICY notifications_select_own ON public.notifications
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

-- Users can mark their own notifications read
DROP POLICY IF EXISTS notifications_update_own ON public.notifications;
CREATE POLICY notifications_update_own ON public.notifications
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Users can delete their own (we don't expect admins to clean these)
DROP POLICY IF EXISTS notifications_delete_own ON public.notifications;
CREATE POLICY notifications_delete_own ON public.notifications
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- service_role inserts via the trigger functions below
GRANT INSERT, UPDATE, SELECT, DELETE ON public.notifications TO service_role;

-- =====================================================================
-- TRIGGER 1: new message → notify all conversation participants
-- The messages table has no `receiver_id` column — the receiver is
-- derived from conversations.{tourist_id,buddy_id} as "the other
-- participant". We insert a notification for every other participant
-- in the conversation (handles future group chats too).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_on_message() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  other_user UUID;
  actor_name TEXT;
BEGIN
  -- Look up conversation participants.
  SELECT tourist_id, buddy_id INTO STRICT other_user, other_user
    FROM public.conversations WHERE id = NEW.conversation_id;

  -- We need the SENDER's name, not the row we just got.
  SELECT full_name INTO actor_name FROM public.profiles WHERE id = NEW.sender_id;
  IF actor_name IS NULL THEN actor_name := 'Someone'; END IF;

  -- We can't keep two variables in STRICT; do it the explicit way:
  FOR other_user IN (
    SELECT CASE WHEN tourist_id = NEW.sender_id THEN buddy_id ELSE tourist_id END AS recipient
    FROM public.conversations WHERE id = NEW.conversation_id
  ) LOOP
    IF other_user = NEW.sender_id THEN
      CONTINUE; -- never notify self
    END IF;

    INSERT INTO public.notifications
      (user_id, type, title, body, link, actor_id, actor_name)
    VALUES (
      other_user,
      'message',
      'New message from ' || actor_name,
      LEFT(NEW.content, 120),
      '/chat?with=' || NEW.sender_id::text,
      NEW.sender_id,
      actor_name
    );
  END LOOP;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_message ON public.messages;
CREATE TRIGGER trg_notify_message
  AFTER INSERT ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_message();

-- =====================================================================
-- TRIGGER 2: connection request → notify recipient
-- =====================================================================
CREATE OR REPLACE FUNCTION public.notify_on_connection() RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  actor_name TEXT;
  recipient_id UUID;
BEGIN
  -- The 'requester_id' is the column we trust (set by the API). If it's
  -- null we fall back to tourist_id for legacy rows.
  IF NEW.requester_id IS NOT NULL THEN
    recipient_id := NEW.recipient_id;
  ELSE
    -- Legacy rows: tourist is the requester, buddy is the recipient.
    recipient_id := NEW.buddy_id;
  END IF;

  SELECT full_name INTO actor_name FROM public.profiles
    WHERE id = COALESCE(NEW.requester_id, NEW.tourist_id);
  IF actor_name IS NULL THEN actor_name := 'Someone'; END IF;

  -- New request (INSERT or status changed from non-pending → pending).
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
      '/buddies/' || COALESCE(NEW.requester_id, NEW.tourist_id)::text,
      COALESCE(NEW.requester_id, NEW.tourist_id),
      actor_name
    );
  END IF;

  -- Status changed to accepted/declined → notify the requester.
  -- We compare against text (NEW.status::text) to avoid an enum-cast
  -- path on some Postgres versions that surfaces as
  -- 'invalid input value for enum connection_status: ""'.
  IF TG_OP = 'UPDATE'
     AND (NEW.status::text = 'accepted' OR NEW.status::text = 'declined')
     AND COALESCE(OLD.status::text, '') <> NEW.status::text THEN
    INSERT INTO public.notifications
      (user_id, type, title, body, link, actor_id, actor_name)
    VALUES (
      COALESCE(NEW.requester_id, NEW.tourist_id),
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
      '/buddies/' || recipient_id::text,
      recipient_id,
      actor_name
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_connection ON public.connections;
CREATE TRIGGER trg_notify_connection
  AFTER INSERT OR UPDATE ON public.connections
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_on_connection();