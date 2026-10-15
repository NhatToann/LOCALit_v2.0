-- 2026-10-15-connection-duration-and-lock.sql
--
-- Adds per-connection duration + lock semantics.
--
-- New columns on public.connections:
--   • duration_days  int 1-30, captured at request time
--   • expires_at     timestamptz  accepted_at + duration_days * 86400
--   • locked_at      timestamptz  set when expires_at < now() (cron)
--   • renewed_at     timestamptz  last renew action
--   • locked         boolean derived from expires_at < now() (computed)
--
-- New column on public.profiles:
--   • default_connection_duration  int 1-30, default 7
--
-- New enum (in case future cancel reasons need to be distinguished):
--   none (lifecycle already exists in connection_lifecycle enum — we
--        reuse it: 'search' = pending, 'active' = active, 'ended' = ended.
--        'locked' is derived from expires_at < now() OR locked_at IS NOT NULL.
--        We do NOT add 'locked' to the enum to keep consumers simple;
--        helper function public.connection_is_locked(c) returns bool.)

-- 1) Columns on public.connections
ALTER TABLE public.connections
  ADD COLUMN IF NOT EXISTS duration_days int
    CHECK (duration_days IS NULL OR (duration_days BETWEEN 1 AND 30)),
  ADD COLUMN IF NOT EXISTS expires_at   timestamptz,
  ADD COLUMN IF NOT EXISTS locked_at    timestamptz,
  ADD COLUMN IF NOT EXISTS renewed_at   timestamptz;

CREATE INDEX IF NOT EXISTS idx_connections_expires_at
  ON public.connections (expires_at)
  WHERE status = 'accepted';

-- 2) Default duration on public.profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS default_connection_duration int NOT NULL DEFAULT 7
    CHECK (default_connection_duration BETWEEN 1 AND 30);

-- 3) Helper: is a connection currently locked?
CREATE OR REPLACE FUNCTION public.connection_is_locked(c public.connections)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN c.status = 'pending' THEN false
    WHEN c.locked_at IS NOT NULL THEN true
    WHEN c.expires_at IS NULL THEN false
    ELSE c.expires_at < now()
  END
$$;

-- 4) Helper: days remaining (negative = expired, null = n/a)
CREATE OR REPLACE FUNCTION public.connection_days_remaining(c public.connections)
RETURNS int
LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN c.status = 'pending' OR c.expires_at IS NULL THEN NULL
    ELSE GREATEST(
      -999,
      CEIL(EXTRACT(EPOCH FROM (c.expires_at - now())) / 86400.0)::int
    )
  END
$$;

-- 5) Trigger: stamp expires_at on accept, clear locked_at, set renewed_at
--    on renew.  Status transitions:
--      pending → accepted:  expires_at = accepted_at + duration_days
--      update expires_at:  noop (only set on accept)
--      renew:              renewed_at = now(), locked_at = null,
--                          expires_at = now() + duration_days
--      decline/cancel:     leave expires_at alone (history)
CREATE OR REPLACE FUNCTION public.tg_connection_expiry() RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  -- First-time accept: set accepted_at + expires_at if missing.
  IF NEW.status = 'accepted' AND (OLD IS NULL OR OLD.status <> 'accepted') THEN
    IF NEW.accepted_at IS NULL THEN
      NEW.accepted_at := now();
    END IF;
    IF NEW.expires_at IS NULL THEN
      IF NEW.duration_days IS NULL THEN
        NEW.duration_days := 7;
      END IF;
      NEW.expires_at := NEW.accepted_at + (NEW.duration_days || ' days')::interval;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_connection_expiry ON public.connections;
CREATE TRIGGER trg_connection_expiry
  BEFORE INSERT OR UPDATE ON public.connections
  FOR EACH ROW EXECUTE FUNCTION public.tg_connection_expiry();

-- 6) Auto-expire job: a function the cron can call to mark stale
--    connections as locked. Idempotent — only flips rows that are
--    accepted AND past expires_at AND still unlocked.
CREATE OR REPLACE FUNCTION public.lock_expired_connections() RETURNS int
LANGUAGE plpgsql
AS $$
DECLARE
  rows int;
BEGIN
  WITH stale AS (
    UPDATE public.connections
    SET locked_at = now()
    WHERE status = 'accepted'
      AND locked_at IS NULL
      AND expires_at IS NOT NULL
      AND expires_at < now()
    RETURNING 1
  )
  SELECT count(*) INTO rows FROM stale;
  RETURN rows;
END;
$$;

-- 7) Renew helper: invoked from API to reset expiry.
CREATE OR REPLACE FUNCTION public.renew_connection(p_connection_id uuid)
RETURNS public.connections
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $$
DECLARE
  caller uuid := auth.uid();
  c      public.connections;
BEGIN
  SELECT * INTO c FROM public.connections WHERE id = p_connection_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'connection_not_found';
  END IF;
  IF caller IS NULL OR (caller <> c.requester_id AND caller <> c.recipient_id
                        AND caller <> c.tourist_id AND caller <> c.buddy_id) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;
  IF c.status <> 'accepted' THEN
    RAISE EXCEPTION 'not_active';
  END IF;

  UPDATE public.connections
  SET expires_at  = now() + (COALESCE(duration_days, 7) || ' days')::interval,
      locked_at   = NULL,
      renewed_at  = now()
  WHERE id = p_connection_id
  RETURNING * INTO c;

  RETURN c;
END;
$$;

GRANT EXECUTE ON FUNCTION public.renew_connection(uuid) TO authenticated;

-- 8) Send-notification helper: used by API when renew/cancel/lock
--    events happen outside the existing trigger.
--    (Optional: we use the existing trigger for accept/reject. We do
--    not push notifications from renew/lock here; the API will do it.)

-- 9) Expand the notifications enum so the bell can render the new
--    event types.  (Idempotent — DO block with IF NOT EXISTS check.)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'notifications_type_check'
  ) THEN
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check CHECK (type IN (
        'message',
        'connection_request',
        'connection_accepted',
        'connection_declined',
        'connection_cancelled',
        'connection_warning',
        'connection_locked',
        'connection_renewed',
        'trip_update'
      ));
  ELSE
    -- drop the existing check so we can re-add it with the wider set
    ALTER TABLE public.notifications DROP CONSTRAINT notifications_type_check;
    ALTER TABLE public.notifications
      ADD CONSTRAINT notifications_type_check CHECK (type IN (
        'message',
        'connection_request',
        'connection_accepted',
        'connection_declined',
        'connection_cancelled',
        'connection_warning',
        'connection_locked',
        'connection_renewed',
        'trip_update'
      ));
  END IF;
END
$$;

-- 10) Make sure service_role still has all the grants it needs
GRANT SELECT, INSERT, UPDATE, DELETE ON public.connections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles    TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.notifications TO service_role;
