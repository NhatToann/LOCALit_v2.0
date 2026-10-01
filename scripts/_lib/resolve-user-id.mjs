#!/usr/bin/env node
/**
 * Shared helpers for Playwright voice/video/mic tests.
 *
 * Why this file exists:
 *   The @supabase/ssr auth wiring (2026-09-26) stores the session in a
 *   **cookie**, not in localStorage. Older tests were written against
 *   the previous localStorage-based supabase-js wiring and now fail to
 *   resolve the signed-in user's id.
 *
 *   These helpers decode the SSR cookie value
 *   (`base64-<URL-safe-base64-of-JSON-stringified session>`) on the
 *   Playwright page object. They are intentionally sync (no Playwright
 *   handle round-trip) so they're easy to slot into existing
 *   `await page.evaluate(...)` blocks.
 *
 *   Cookie name is centralised as SUPABASE_COOKIE so a future project
 *   ref change touches one place.
 */

/** Supabase project ref used by LOCALit (matches AGENTS.md). */
export const SUPABASE_REF = 'pqvnjgyqbxlylawwogjv'

/** Cookie name @supabase/ssr writes for the session. */
export const SUPABASE_COOKIE = `sb-${SUPABASE_REF}-auth-token`

/**
 * Decode the SSR cookie value back into a plain session object.
 *
 * @param {string} raw  The raw cookie value (e.g. `base64-eyJhY2Nlc3Nf…`)
 * @returns {object|null} Parsed session, or null when malformed.
 */
export function decodeSupabaseCookie(raw) {
  if (!raw) return null
  let payload = raw
  if (payload.startsWith('base64-')) {
    payload = payload.slice('base64-'.length)
    // URL-safe → standard base64
    payload = payload.replace(/-/g, '+').replace(/_/g, '/')
    // Pad to multiple of 4
    while (payload.length % 4 !== 0) payload += '='
    try {
      payload = Buffer.from(payload, 'base64').toString('utf8')
    } catch {
      return null
    }
  }
  try {
    return JSON.parse(payload)
  } catch {
    return null
  }
}

/**
 * Page.evaluate body that returns the signed-in user's id, scanning
 * cookies (SSR) and falling back to localStorage keys for the legacy
 * supabase-js clients that some old browsers still keep around.
 *
 * Returns null when no session can be found — caller decides whether
 * that's a hard failure.
 */
export const FIND_USER_ID_EVAL = `(cookieName) => {
  // 1) SSR cookie (current wiring)
  try {
    const match = (document.cookie || '').split('; ').find((c) => c.startsWith(cookieName + '='))
    if (match) {
      const raw = decodeURIComponent(match.slice(cookieName.length + 1))
      const session = (function decode(raw) {
        let payload = raw
        if (payload.startsWith('base64-')) {
          payload = payload.slice(7).replace(/-/g, '+').replace(/_/g, '/')
          while (payload.length % 4) payload += '='
          try { payload = atob(payload) } catch { return null }
        }
        try { return JSON.parse(payload) } catch { return null }
      })(raw)
      if (session && session.user && session.user.id) return session.user.id
    }
  } catch {}
  // 2) Legacy supabase-js localStorage keys (still kept by some browsers)
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.includes('auth-token')) continue
      const parsed = JSON.parse(localStorage.getItem(k) || 'null')
      if (parsed && parsed.user && parsed.user.id) return parsed.user.id
    }
  } catch {}
  return null
}`

/**
 * Convenience wrapper — runs FIND_USER_ID_EVAL on the given Playwright
 * page/context. Returns the user id string or null.
 *
 * @param {import('playwright').Page} page
 * @returns {Promise<string|null>}
 */
export async function findUserId(page) {
  return await page.evaluate(FIND_USER_ID_EVAL, SUPABASE_COOKIE)
}

/**
 * Strict variant — throws when the user id cannot be resolved. Use in
 * test bodies where an unresolved id is a fatal setup error.
 *
 * @param {import('playwright').Page} page
 * @param {string} label  Human-friendly label for the error message.
 * @returns {Promise<string>}
 */
export async function requireUserId(page, label = 'user') {
  const id = await findUserId(page)
  if (!id) {
    throw new Error(
      `Could not resolve ${label} id from cookies/localStorage. ` +
        `Make sure the page is signed in and ${SUPABASE_COOKIE} is set.`,
    )
  }
  return id
}
