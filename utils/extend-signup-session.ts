/**
 * Shared logic for extending the lifetime of an OTP-verified signup row.
 *
 * Used by:
 *   - /api/auth/signup/verify-otp (extend right after OTP is verified, so
 *     the user has a fresh 15-min window from this moment)
 *   - /api/auth/signup/extend-session (the client-callable extension route)
 *   - /api/auth/signup/complete (auto-extend when the row has expired but
 *     the user already passed the OTP gate)
 *
 * Rules:
 *   - Only extends rows where verified_at IS NOT NULL AND consumed_at IS NULL.
 *     Extending an unverified row would defeat the OTP gate; extending an
 *     already-consumed row is pointless.
 *   - Returns { ok, expiresAt } in ISO format. expiresAt is "now + TTL".
 *   - No-op returns ok:false with a reason — caller maps that to a status code.
 */

import { selectEmailVerification, updateEmailVerification } from '@/utils/db-pg'

export const PROFILE_TTL_MS = 15 * 60 * 1000

export type ExtendResult =
  | { ok: true; expiresAt: string }
  | {
      ok: false
      reason: 'not_found' | 'already_completed' | 'not_verified' | 'db_error'
      error: string
    }

export async function extendSignupSession(signupId: string): Promise<ExtendResult> {
  const sel = await selectEmailVerification(signupId)
  if (sel.error || !sel.data) {
    return { ok: false, reason: 'not_found', error: 'No active signup.' }
  }
  const data = sel.data
  if (data.consumed_at) {
    return { ok: false, reason: 'already_completed', error: 'This signup was already completed.' }
  }
  if (!data.verified_at) {
    return { ok: false, reason: 'not_verified', error: 'Email has not been verified yet.' }
  }

  const newExpiresAt = new Date(Date.now() + PROFILE_TTL_MS).toISOString()
  const upd = await updateEmailVerification(data.id, { expires_at: newExpiresAt })
  if (upd.error) {
    return { ok: false, reason: 'db_error', error: upd.error.message }
  }
  return { ok: true, expiresAt: newExpiresAt }
}