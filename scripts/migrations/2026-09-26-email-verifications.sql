-- Email verification: 6-digit OTP codes sent on signup.
-- service_role is the only writer (from signup-admin / verify-otp routes).
-- Users can read their own row only after they are authenticated.
CREATE TABLE IF NOT EXISTS public.email_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash text NOT NULL,                       -- bcrypt hash of the 6-digit code
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,                       -- set when the user verifies successfully
  attempts integer NOT NULL DEFAULT 0,           -- failed verify attempts on this code
  ip_address inet,                               -- last attempted IP (best effort)
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS email_verifications_user_idx
  ON public.email_verifications(user_id);

CREATE INDEX IF NOT EXISTS email_verifications_active_idx
  ON public.email_verifications(user_id) WHERE consumed_at IS NULL;

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

-- Owners can see their own codes (e.g. to display "code sent" hint). Service
-- role has full access via GRANT (set by scripts/fix-grants.mjs).
DROP POLICY IF EXISTS "Users can view own verification codes" ON public.email_verifications;
CREATE POLICY "Users can view own verification codes"
  ON public.email_verifications
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Don't allow INSERT/UPDATE from anon/authenticated; service role bypasses RLS
-- anyway so it doesn't need a policy.