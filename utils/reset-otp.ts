/**
 * Password reset via emailed 6-digit OTP.
 *
 * WHY THIS EXISTS (2026-10-11)
 * ---------------------------
 * The Supabase recovery-link flow is unusable on this project:
 * `/auth/v1/recover` returns 429 `over_email_send_rate_limit` for
 * already-registered addresses, and that throttle is per-recipient and
 * long-lived. The user clicks "Send reset link", sees success, and no
 * email ever arrives — so every recovery attempt dead-ends.
 *
 * This module replaces the link with a code we mail ourselves via
 * `sendEmail()` (SMTP/Resend), which does NOT touch GoTrue and is not
 * subject to that throttle.
 *
 * WHY IT NEEDS NO SERVICE-ROLE KEY
 * -------------------------------
 * `auth.users` is an ordinary Postgres table. We hold the DB password, so
 * the new password hash is written with `crypt()` directly — the same
 * function GoTrue itself verifies against. Verified end-to-end by
 * scripts/prove-pg-password-reset.mjs:
 *
 *   sign in with old password -> rejected
 *   sign in with new password -> 200
 *
 * SECURITY TRADEOFF (accepted deliberately, 2026-10-11)
 * --------------------------------------------------
 * A recovery LINK proves inbox possession once, cryptographically. A 6-digit
 * code is weaker: anyone who can receive mail for an address can reset it.
 * Mitigations in place:
 *   - codes are bcrypt-hashed at rest (never stored in plaintext)
 *   - 15-minute TTL
 *   - 5 wrong attempts invalidates the code
 *   - per-IP rate limit on every endpoint in the chain
 *   - generic responses so the API never confirms whether an email exists
 *   - all live recovery tokens are cleared on success, so an old link
 *     cannot be replayed afterwards
 *   - the code is invalidated the moment the password changes
 *
 * Lifecycle (reuses public.email_verifications):
 *   1. POST /api/auth/reset-otp/start   { email }        → rows + mails a code
 *   2. POST /api/auth/reset-otp/verify  { resetId, code } → marks verified_at
 *   3. POST /api/auth/reset-otp/complete{ resetId, password } → writes the hash
 *
 * The row's `pending_payload` carries `{ kind: 'password_reset', email }`
 * so the same table serves both signup and reset without a schema change.
 */
import {
  insertEmailVerification,
  selectEmailVerification,
  updateEmailVerification,
  consumeUnverifiedCodesForEmail,
  setUserPasswordByEmail,
} from './db-pg'
import { sendEmail, generateOtp } from './email'
import { validatePassword } from './password-validator'
import bcrypt from 'bcryptjs'

const RESET_OTP_TTL_MS = 15 * 60 * 1000
const MAX_ATTEMPTS = 5

export interface ResetPayload {
  kind: 'password_reset'
  email: string
}

export type IssueResetOtpResult =
  | { ok: true; resetId: string; email: string; devCode?: string }
  | { ok: false; error: string; reason: 'mail_failed' }

export type VerifyResetOtpResult =
  | { ok: true; resetId: string; email: string }
  | {
      ok: false
      reason:
        | 'no_code'
        | 'expired'
        | 'wrong_code'
        | 'too_many_attempts'
        | 'wrong_kind'
      error: string
    }

export type CompleteResetResult =
  | { ok: true }
  | { ok: false; reason: 'not_verified' | 'weak_password' | 'user_missing' | 'db_error'; error: string }

/**
 * Build the reset-code email. Separate from `buildOtpEmail` because the
 * copy must not say "verify your email to finish signing up" — this is a
 * password reset, and conflating the two is how people end up on the wrong
 * screen.
 */
function buildResetEmail(email: string, code: string): {
  subject: string
  html: string
  text: string
} {
  const subject = `${code} is your LOCALit password reset code`
  const text =
    `Your LOCALit password reset code is: ${code}\n\n` +
    `Enter it at the password reset page to choose a new password.\n` +
    `This code expires in 15 minutes and can only be used once.\n\n` +
    `If you did not request a password reset, you can ignore this email — ` +
    `your password will not change.\n\n— The LOCALit team`
  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;background:#ECFDF5;padding:24px;color:#0A1F1D">
  <div style="max-width:480px;margin:0 auto;background:#F0FDF4;border-radius:12px;padding:32px;border:1px solid #BBF7D0">
    <h1 style="margin:0 0 8px 0;font-size:20px;color:#134E4A">LOCALit</h1>
    <p style="margin:0 0 24px 0;color:#4B5563">Use this code to set a new password.</p>
    <div style="font-size:32px;letter-spacing:8px;font-weight:700;background:#D1FAE5;border-radius:8px;padding:16px;text-align:center;color:#0A1F1D">${code}</div>
    <p style="margin:24px 0 0 0;color:#6B7280;font-size:14px">
      This code expires in <strong>15 minutes</strong> and works once.
      Requested for <strong>${escapeHtml(email)}</strong>.
    </p>
    <hr style="border:none;border-top:1px solid #BBF7D0;margin:24px 0">
    <p style="margin:0;color:#6B7280;font-size:12px">
      If you did not request this, ignore the email — your password will not change.
    </p>
  </div>
</body></html>`
  return { subject, html, text }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * Issue a reset code for an email address.
 *
 * NOTE ON ENUMERATION: the CALLER is responsible for not revealing whether
 * the address exists. This function returns ok:false only when the mail
 * transport itself failed, which is a property of our infrastructure, not
 * of the address.
 */
export async function issueResetOtp(
  email: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<IssueResetOtpResult> {
  const code = generateOtp()
  const codeHash = await bcrypt.hash(code, 10)
  const expiresAt = new Date(Date.now() + RESET_OTP_TTL_MS).toISOString()

  // Invalidate any earlier live codes for this address so only one is
  // ever valid. Keeps a stale inbox email from working after a resend.
  await consumeUnverifiedCodesForEmail(email)

  const payload: ResetPayload = { kind: 'password_reset', email }

  const ins = await insertEmailVerification({
    email,
    pending_payload: payload as unknown as Record<string, unknown>,
    code_hash: codeHash,
    expires_at: expiresAt,
    ip_address: meta.ip ?? null,
    user_agent: meta.userAgent ?? null,
  })

  if (ins.error || !ins.data) {
    return {
      ok: false,
      reason: 'mail_failed',
      error: `Could not store reset code: ${ins.error?.message ?? 'unknown'}`,
    }
  }

  // DEV: OTP_PREVIEW echoes the code so the flow is testable without an inbox.
  // Unset in production — see AGENTS.md.
  if (process.env.OTP_PREVIEW === 'true') {
    console.warn(
      `[reset-otp] DEV PREVIEW — ${email}: ${code} (resetId=${ins.data.id})`,
    )
    return { ok: true, resetId: ins.data.id, email, devCode: code }
  }

  const message = buildResetEmail(email, code)
  const sent = await sendEmail({
    to: email,
    subject: message.subject,
    html: message.html,
    text: message.text,
  })

  if (!sent.ok) {
    // Don't leave a usable code behind if we could not deliver it.
    await updateEmailVerification(ins.data.id, { consumed_at: new Date().toISOString() })
    return { ok: false, reason: 'mail_failed', error: `Email send failed: ${sent.error}` }
  }

  return { ok: true, resetId: ins.data.id, email }
}

/** Check a submitted code against the active reset row. */
export async function verifyResetOtp(
  resetId: string,
  code: string,
): Promise<VerifyResetOtpResult> {
  const sel = await selectEmailVerification(resetId)
  if (sel.error || !sel.data) {
    return { ok: false, reason: 'no_code', error: 'This reset request is no longer valid.' }
  }
  const row = sel.data

  // A signupId must never be usable to reset a password, and vice versa.
  const payload = row.pending_payload as unknown as Partial<ResetPayload>
  if (payload?.kind !== 'password_reset' || typeof payload.email !== 'string') {
    return { ok: false, reason: 'wrong_kind', error: 'This reset request is no longer valid.' }
  }

  if (row.consumed_at) {
    return { ok: false, reason: 'no_code', error: 'This reset request was already used.' }
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'expired', error: 'This code has expired. Request a new one.' }
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return {
      ok: false,
      reason: 'too_many_attempts',
      error: 'Too many incorrect attempts. Request a new code.',
    }
  }

  const matches = await bcrypt.compare(code, row.code_hash)
  if (!matches) {
    await updateEmailVerification(row.id, { attempts: row.attempts + 1 })
    return { ok: false, reason: 'wrong_code', error: 'That code is not correct.' }
  }

  const upd = await updateEmailVerification(row.id, {
    attempts: row.attempts + 1,
    verified_at: new Date().toISOString(),
  })
  if (upd.error) {
    return { ok: false, reason: 'no_code', error: 'Could not verify this code. Try again.' }
  }

  return { ok: true, resetId: row.id, email: payload.email }
}

/**
 * Write the new password for a verified reset request.
 *
 * Refuses unless `verified_at` is set by verifyResetOtp above, so knowing a
 * resetId alone is not enough — the correct code is still required.
 */
export async function completePasswordReset(
  resetId: string,
  newPassword: string,
): Promise<CompleteResetResult> {
  const pwErr = validatePassword(newPassword)
  if (pwErr) return { ok: false, reason: 'weak_password', error: pwErr }

  const sel = await selectEmailVerification(resetId)
  if (sel.error || !sel.data) {
    return { ok: false, reason: 'not_verified', error: 'This reset request is no longer valid.' }
  }
  const row = sel.data

  const payload = row.pending_payload as unknown as Partial<ResetPayload>
  if (payload?.kind !== 'password_reset' || typeof payload.email !== 'string') {
    return { ok: false, reason: 'not_verified', error: 'This reset request is no longer valid.' }
  }
  if (!row.verified_at) {
    return {
      ok: false,
      reason: 'not_verified',
      error: 'Enter the code from your email before setting a new password.',
    }
  }
  if (row.consumed_at) {
    return { ok: false, reason: 'not_verified', error: 'This reset request was already used.' }
  }
  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false, reason: 'not_verified', error: 'This code has expired. Request a new one.' }
  }

  // The one call that actually changes the password. Also clears every
  // live recovery/reauth token, so a reset link emailed earlier stops
  // working immediately.
  const written = await setUserPasswordByEmail(payload.email, newPassword)
  if (!written.ok) {
    return {
      ok: false,
      reason: written.userMissing ? 'user_missing' : 'db_error',
      error: written.error ?? 'Could not update the password.',
    }
  }

  // Burn the code so it cannot be replayed.
  await updateEmailVerification(row.id, {
    consumed_at: new Date().toISOString(),
  })

  return { ok: true }
}