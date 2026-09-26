/**
 * OTP management for email verification.
 *
 * Flow:
 *   1. Signup-admin calls issueOtp(userId, email) → 6-digit code, stores
 *      bcrypt-hashed in email_verifications, returns the plaintext code so
 *      the caller can email it.
 *   2. User submits the code via /verify-email.
 *   3. /api/auth/verify-otp calls consumeOtp(userId, code) → returns
 *      { ok: true } if the code matches and isn't expired/consumed.
 *      Then the route flips auth.users.email_confirmed_at via admin API.
 *
 * Security:
 *   - Codes are bcrypt-hashed so a DB leak doesn't grant access.
 *   - Each row has a per-attempt counter and a 15-minute TTL.
 *   - 5 failed attempts invalidate the code and force a resend.
 */
import { createAdminClient } from './supabase/admin'
import { sendEmail, buildOtpEmail, generateOtp } from './email'
// bcryptjs is a pure-JS bcrypt; avoids native node-gyp build issues.
import bcrypt from 'bcryptjs'

const OTP_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export interface IssueOtpResult {
  ok: boolean
  /** Plaintext code, returned to the caller (it will be emailed). */
  code?: string
  error?: string
}

export async function issueOtp(userId: string, email: string): Promise<IssueOtpResult> {
  const admin = createAdminClient()
  const code = generateOtp()
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + OTP_TTL_MS).toISOString()

  // Invalidate any older pending codes for this user so we always have a
  // single active code per user at a time.
  const { error: invalidateErr } = await admin
    .from('email_verifications')
    .update({ consumed_at: new Date().toISOString() })
    .eq('user_id', userId)
    .is('consumed_at', null)
  if (invalidateErr) {
    return { ok: false, error: `Could not invalidate prior codes: ${invalidateErr.message}` }
  }

  const { error: insertErr } = await admin
    .from('email_verifications')
    .insert({
      user_id: userId,
      code_hash: codeHash,
      expires_at: expiresAt,
    })
  if (insertErr) {
    return { ok: false, error: `Could not store code: ${insertErr.message}` }
  }

  const message = buildOtpEmail({ code })
  const sent = await sendEmail({ to: email, subject: message.subject, html: message.html, text: message.text })
  if (!sent.ok) {
    return { ok: false, error: `Email send failed: ${sent.error}` }
  }

  return { ok: true, code }
}

export type ConsumeOtpResult =
  | { ok: true }
  | { ok: false; reason: 'no_code' | 'expired' | 'too_many_attempts' | 'wrong_code'; error: string }

/**
 * Verify the supplied 6-digit code against the active record for this user.
 * Does NOT confirm the user's email — caller should do that separately via
 * admin.auth.admin.updateUserById.
 */
export async function consumeOtp(userId: string, code: string): Promise<ConsumeOtpResult> {
  const admin = createAdminClient()

  const { data, error } = await admin
    .from('email_verifications')
    .select('id, code_hash, expires_at, attempts, consumed_at')
    .eq('user_id', userId)
    .is('consumed_at', null)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) return { ok: false, reason: 'no_code', error: `Lookup failed: ${error.message}` }
  if (!data) return { ok: false, reason: 'no_code', error: 'No active verification code. Please request a new one.' }

  if (new Date(data.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', error: 'Code has expired. Please request a new one.' }
  }
  if (data.attempts >= MAX_ATTEMPTS) {
    return { ok: false, reason: 'too_many_attempts', error: 'Too many failed attempts. Please request a new code.' }
  }

  const matches = await bcrypt.compare(code, data.code_hash)
  if (!matches) {
    // Bump attempts. If we've now hit the limit, leave consumed_at null so
    // a future "request new code" flow invalidates it cleanly.
    await admin
      .from('email_verifications')
      .update({ attempts: data.attempts + 1 })
      .eq('id', data.id)
    return { ok: false, reason: 'wrong_code', error: 'Incorrect code.' }
  }

  const { error: consumeErr } = await admin
    .from('email_verifications')
    .update({ consumed_at: new Date().toISOString(), attempts: data.attempts + 1 })
    .eq('id', data.id)
  if (consumeErr) return { ok: false, reason: 'no_code', error: `Could not mark consumed: ${consumeErr.message}` }

  return { ok: true }
}