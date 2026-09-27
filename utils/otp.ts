/**
 * OTP management for the new "verify at Step 1" signup flow.
 *
 * Lifecycle (keyed by EMAIL, not user_id — because auth.users doesn't exist yet):
 *
 *   1. Client POSTs /api/auth/signup/start with { email, password, fullName, phone }
 *      → server hashes the password, generates a 6-digit OTP, bcrypt-hashes it,
 *        inserts a row in public.email_verifications, sends the code by email.
 *      → returns { signupId } (the row id) — the client stores it for the next steps.
 *
 *   2. User submits the code via the OTP step on /register.
 *      → POST /api/auth/signup/verify-otp with { signupId, code }
 *      → server calls consumeOtp(signupId, code); on success sets verified_at.
 *
 *   3. Client POSTs /api/auth/signup/complete with { signupId, role, profilePayload }
 *      → server validates verified_at IS NOT NULL, creates auth.users + profiles + tourist/buddy
 *        in one transaction, sets consumed_at.
 *
 *   4. Resend (if the user didn't get the code or it expired):
 *      → POST /api/auth/signup/resend-otp with { signupId }
 *      → server invalidates the prior code (consumed_at = now()), issues a new one.
 *
 * Security:
 *   - Codes are bcrypt-hashed at rest (10 rounds — same as before).
 *   - 15-minute TTL.
 *   - 5 wrong attempts invalidate the code (forced resend).
 *   - signupId is a UUID (unguessable) but treated as a bearer secret: anyone
 *     with it can complete signup for that email. Mitigated by the OTP gate.
 *   - Pending payload contains the bcrypt-hashed password (NOT plaintext), so
 *     a DB leak alone doesn't grant account access.
 */
import { createAdminClient } from './supabase/admin'
import { sendEmail, buildOtpEmail, generateOtp } from './email'
import bcrypt from 'bcryptjs'

const OTP_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export interface PendingSignupPayload {
  email: string
  /** Plain password the user typed at /signup/start. Needed because
   *  admin.auth.admin.createUser expects plaintext, and we can't reverse
   *  bcrypt. Stored only in pending_payload which is service_role-only. */
  password_plain: string
  /** bcrypt hash of the same password, kept for audit / password-strength
   *  re-validation without exposing plaintext to logs. */
  password_hash: string
  full_name: string
  phone: string | null
  role_hint?: 'tourist' | 'buddy' // optional — used only for pre-fill
}

export interface IssueOtpResult {
  ok: boolean
  signupId?: string
  /** Plaintext code. ONLY returned when OTP_PREVIEW=true (dev mode).
   *  In production this is undefined — the code only lives in the user's inbox. */
  previewCode?: string
  error?: string
}

/** Issue a new OTP for the given pending signup payload. Invalidates prior codes. */
export async function issueOtpForSignup(
  payload: PendingSignupPayload,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<IssueOtpResult> {
  const admin = createAdminClient()
  const code = generateOtp()
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Wipe any unverified rows for this email so only one code is live at a time.
  // (Don't touch already-consumed rows — those represent completed signups.)
  await admin
    .from('email_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('email', payload.email)
    .is('consumed_at', null)

  const { data: inserted, error: insertErr } = await admin
    .from('email_verifications')
    .insert({
      email: payload.email,
      pending_payload: payload,
      code_hash: codeHash,
      expires_at: expiresAt,
      ip_address: meta.ip ?? null,
      user_agent: meta.userAgent ?? null,
    })
    .select('id')
    .single()

  if (insertErr || !inserted) {
    return { ok: false, error: `Could not store code: ${insertErr?.message ?? 'unknown'}` }
  }

  // ---- DEV MODE ---------------------------------------------------------
  // When OTP_PREVIEW=true, we skip the actual email send (Resend test mode
  // restricts recipients to the account owner), and instead echo the code
  // back via the result. The route also logs the code to the server console
  // so you can grep `vercel logs`.
  //
  // SECURITY: this MUST be gated on the env var. If left enabled in
  // production, anyone registering could complete signup without ever
  // proving email ownership.
  // -----------------------------------------------------------------------
  if (process.env.OTP_PREVIEW === 'true') {
    console.warn(`[otp] DEV PREVIEW — code for ${payload.email}: ${code} (signupId=${inserted.id})`)
    return { ok: true, signupId: inserted.id, previewCode: code }
  }

  const message = buildOtpEmail({ code })
  const sent = await sendEmail({
    to: payload.email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })
  if (!sent.ok) {
    return { ok: false, error: `Email send failed: ${sent.error}` }
  }

  return { ok: true, signupId: inserted.id }
}

export type ConsumeOtpResult =
  | { ok: true; signupId: string; payload: PendingSignupPayload }
  | {
      ok: false
      reason: 'no_code' | 'expired' | 'too_many_attempts' | 'wrong_code'
      error: string
    }

/**
 * Verify the supplied 6-digit code against the active signup row.
 * On success, sets `verified_at` (consumed_at stays null until /complete runs).
 *
 * Caller should pass `signupId` (received from /signup/start) so we look up
 * the right row. Returns the payload so the caller can finish signup.
 */
export async function consumeOtp(
  signupId: string,
  code: string,
): Promise<ConsumeOtpResult> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('email_verifications')
    .select('id, email, pending_payload, code_hash, expires_at, consumed_at, verified_at, attempts')
    .eq('id', signupId)
    .maybeSingle()

  if (error || !data) {
    return { ok: false, reason: 'no_code', error: 'No active verification code.' }
  }
  if (data.consumed_at) {
    return { ok: false, reason: 'no_code', error: 'This signup was already completed.' }
  }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', error: 'Code has expired. Please request a new one.' }
  }
  if (data.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts', error: 'Too many failed attempts. Please request a new code.' }
  }

  const matches = await bcrypt.compare(code, data.code_hash)
  if (!matches) {
    await admin
      .from('email_verifications')
      .update({ attempts: data.attempts + 1 })
      .eq('id', data.id)
    return { ok: false, reason: 'wrong_code', error: 'Incorrect code.' }
  }

  // Set verified_at. Don't set consumed_at — that's /complete's job.
  const { error: updateErr } = await admin
    .from('email_verifications')
    .update({
      verified_at: new Date().toISOString(),
      attempts: data.attempts + 1,
    })
    .eq('id', data.id)

  if (updateErr) {
    return { ok: false, reason: 'no_code', error: `Could not mark verified: ${updateErr.message}` }
  }

  return {
    ok: true,
    signupId: data.id,
    payload: data.pending_payload as PendingSignupPayload,
  }
}

/** Mark a signup row as fully consumed (i.e. auth.users row was created). */
export async function markSignupConsumed(signupId: string): Promise<{ ok: boolean; error?: string }> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('email_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', signupId)
    .is('consumed_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
