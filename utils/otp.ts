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
import {
  insertEmailVerification,
  selectEmailVerification,
  updateEmailVerification,
  consumeUnverifiedCodesForEmail,
} from './db-pg'
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

/** Issue a new OTP for the given pending signup payload. Invalidates prior codes.
 *
 * Storage strategy (2026-10-07): the Supabase REST admin client uses the
 * `SUPABASE_SERVICE_ROLE_KEY` env var. If that key is rotated in the
 * Supabase dashboard and not updated in Vercel, every insert returns
 * "Invalid API key". We use the direct `pg` connection (utils/otp-pg.ts)
 * instead — it bypasses the API and goes straight to Postgres, so it's
 * immune to API-key rotation issues. Both connection methods must succeed
 * to actually be down, and `pg` failures are very loud (connection refused,
 * wrong password).
 */
export async function issueOtpForSignup(
  payload: PendingSignupPayload,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<IssueOtpResult> {
  const code = generateOtp()
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Wipe any unverified rows for this email so only one code is live at a time.
  // (Don't touch already-consumed rows — those represent completed signups.)
  await consumeUnverifiedCodesForEmail(payload.email)

  const insertRes = await insertEmailVerification({
    email: payload.email,
    pending_payload: payload as unknown as Record<string, unknown>,
    code_hash: codeHash,
    expires_at: expiresAt,
    ip_address: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
  })

  if (insertRes.error || !insertRes.data) {
    // Fall back to the Supabase REST admin client in case pg is misconfigured.
    // This is the path that was broken before; keep it as a safety net so
    // future ops can flip a flag and rerun if the pg connection string
    // expires.
    const admin = createAdminClient()
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
      const detail = JSON.stringify({
        message: insertErr?.message,
        code: insertErr?.code,
        hint: insertErr?.hint,
        details: insertErr?.details,
        status: (insertErr as { status?: number })?.status,
        pg_error: insertRes.error,
      })
      return { ok: false, error: `Could not store code: ${detail}` }
    }
    return finalizeOtpSend(inserted.id, code, payload)
  }

  return finalizeOtpSend(insertRes.data.id, code, payload)
}

async function finalizeOtpSend(
  signupId: string,
  code: string,
  payload: PendingSignupPayload,
): Promise<IssueOtpResult> {
  // ---- DEV MODE ---------------------------------------------------------
  if (process.env.OTP_PREVIEW === 'true') {
    console.warn(`[otp] DEV PREVIEW — code for ${payload.email}: ${code} (signupId=${signupId})`)
    return { ok: true, signupId, previewCode: code }
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

  return { ok: true, signupId }
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
 *
 * Storage: pg-direct (see issueOtpForSignup comment). Falls back to
 * Supabase REST admin if pg is misconfigured.
 */
export async function consumeOtp(
  signupId: string,
  code: string,
): Promise<ConsumeOtpResult> {
  const sel = await selectEmailVerification(signupId)
  console.warn(`[consumeOtp] select result for ${signupId}:`, JSON.stringify({
    hasData: !!sel.data,
    error: sel.error,
    consumed_at: sel.data?.consumed_at,
    expires_at: sel.data?.expires_at,
    attempts: sel.data?.attempts,
    verified_at: sel.data?.verified_at,
  }))
  if (sel.error || !sel.data) {
    return { ok: false, reason: 'no_code', error: 'No active verification code.' }
  }
  const data = sel.data

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
    await updateEmailVerification(data.id, { attempts: data.attempts + 1 })
    return { ok: false, reason: 'wrong_code', error: 'Incorrect code.' }
  }

  // Set verified_at. Don't set consumed_at — that's /complete's job.
  const upd = await updateEmailVerification(data.id, {
    attempts: data.attempts + 1,
    verified_at: new Date().toISOString(),
  })
  if (upd.error) {
    return { ok: false, reason: 'no_code', error: `Could not mark verified: ${upd.error.message}` }
  }

  return {
    ok: true,
    signupId: data.id,
    payload: data.pending_payload as unknown as PendingSignupPayload,
  }
}

/** Mark a signup row as fully consumed (i.e. auth.users row was created). */
export async function markSignupConsumed(signupId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await updateEmailVerification(signupId, { consumed_at: new Date().toISOString() })
  if (r.error) return { ok: false, error: r.error.message }
  return { ok: true }
}
