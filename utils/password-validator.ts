/**
 * Shared password validator. Used by both `/api/auth/signup` and
 * `/api/auth/signup-admin` to enforce a consistent minimum-strength policy.
 *
 * Minimum requirements:
 *   - At least 10 characters (was 6 — see redteam Vuln #9).
 *   - At least one lower-case letter.
 *   - At least one upper-case letter OR one digit OR one symbol.
 *
 * Returns `null` on success, or a human-readable error message on failure.
 */
export function validatePassword(pw: string): string | null {
  if (typeof pw !== 'string') return 'Password is required.'
  if (pw.length < 10) return 'Password must be at least 10 characters.'
  if (pw.length > 128) return 'Password is too long (max 128 characters).'
  if (!/[a-z]/.test(pw)) return 'Password must include at least one lowercase letter.'
  if (!/[a-zA-Z]/.test(pw) || !/[^a-zA-Z]/.test(pw)) {
    // Need at least one letter AND one non-letter (digit or symbol).
    return 'Password must include at least one letter and one number or symbol.'
  }
  return null
}
