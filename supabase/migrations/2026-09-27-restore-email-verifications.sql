-- =================================================================
-- 2026-09-27: Restore email_verifications for the new "OTP at Step 1" flow
-- =================================================================
-- Schema change vs the 2026-09-26 version:
--   * `user_id` FK → auth.users is REMOVED. We now create the auth.users row
--     only AFTER OTP verification, so the OTP table must be keyed by email
--     instead of user_id.
--   * `pending_payload jsonb` holds everything the user typed in Step 0
--     (full_name, password_hash, phone, etc.) so /api/auth/signup/complete
--     can create the auth.users row from it without re-asking.
--   * `verified_at` is set when the code matches. The /complete route refuses
--     to create the account unless verified_at IS NOT NULL.
--
-- Lifetime:
--   * expires_at: 15 minutes after issue
--   * consumed_at: set on successful verify (so resend issues a fresh row)
--   * verified_at: pinned at the moment the code matches; consumed_at is set
--     when /complete uses it (typically minutes later)
--
-- RLS:
--   * RLS enabled, no policies → anon + authenticated get DENIED.
--   * service_role bypasses RLS so all writes happen via admin client.
--
-- Idempotent: safe to re-run.
-- =================================================================

CREATE TABLE IF NOT EXISTS public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  -- The user's form data at the moment OTP was issued. NOT NULL because we
  -- need this to actually create the account later. Encrypted at rest via
  -- pgcrypto if you want — for now we just rely on RLS + no anon read.
  pending_payload jsonb NOT NULL,
  code_hash text NOT NULL,                       -- bcrypt hash of the 6-digit code
  expires_at timestamptz NOT NULL,
  verified_at timestamptz,                       -- set when code matches; consumed_at may be later
  consumed_at timestamptz,                       -- set when /complete uses it (account created)
  attempts integer NOT NULL DEFAULT 0,           -- failed verify attempts
  ip_address inet,                               -- last attempted IP (best effort)
  user_agent text,                               -- browser fingerprint for forensics
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verifications_email_idx
  ON public.email_verifications(email);

CREATE INDEX IF NOT EXISTS email_verifications_active_idx
  ON public.email_verifications(email) WHERE consumed_at IS NULL;

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS, so we don't need any policies. Explicit deny is
-- the safest default. If a future flow needs users to read their own row,
-- add a SELECT policy keyed on a signed signup token (NOT auth.uid() since
-- the user doesn't exist yet).

-- Note: GRANT to service_role must be re-issued by scripts/fix-grants.mjs
-- after running this migration, since CREATE TABLE doesn't grant by default.
