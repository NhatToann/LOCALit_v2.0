#!/usr/bin/env node
/**
 * Authenticated Playwright context builder.
 *
 * Why this exists:
 *   - The /login form on production is gated by Vercel Deployment
 *     Protection (SSO redirect to vercel.com/login). Driving the form
 *     via Playwright then waiting for the real `LOCALit` form to
 *     hydrate only works intermittently depending on bypass-header
 *     propagation, network timing, and FedCM cookies. That's why the
 *     older `loginAs(page, email, password)` helper in the voice
 *     regression test had flaky results.
 *   - The canonical pattern in this repo (see
 *     `scripts/playwright-call-test.mjs`, `scripts/playwright-call-repro.mjs`,
 *     `scripts/verify-voice-call.mjs`) is:
 *       1. Sign in via Supabase Auth REST API (`/auth/v1/token`).
 *       2. Build the SSR cookie in the `base64-…` format @supabase/ssr
 *          reads back, with chunking at 3180 chars.
 *       3. Inject via `context.addCookies(...)`.
 *       4. Also seed `localStorage` so the client-side
 *          `supabase.auth.getSession()` path works.
 *
 *   This helper does steps 2-4 in one call so test scripts only need
 *   step 1.
 *
 * Usage:
 *   import { signIn, buildContext } from './_lib/auth-context.mjs'
 *   const session = await signIn(email, password)
 *   const ctx = await buildContext(browser, session, { baseURL: API_BASE })
 */

import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://pqvnjgyqbxlylawwogjv.supabase.co'
export const SUPABASE_ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

/**
 * Sign in via Supabase Auth REST. Returns the full session JSON
 * (access_token, refresh_token, expires_at, user, …) — same shape as
 * the SDK, just without the persistSession side-effect.
 */
export async function signIn(email, password) {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const r = await sb.auth.signInWithPassword({ email, password })
  if (r.error || !r.data?.session) {
    throw new Error(
      `signIn failed for ${email}: ${r.error?.message ?? 'no session'}`,
    )
  }
  return r.data.session
}

/**
 * Build a Playwright BrowserContext pre-seeded with the SSR cookie
 * AND the matching localStorage entry. The browser then opens
 * already-authenticated without ever hitting /login.
 *
 * @param {import('playwright').Browser} browser
 * @param {object} session  Result of signIn() — must include
 *   access_token, refresh_token, expires_in, expires_at, user.
 * @param {object} [opts]
 * @param {string} [opts.baseURL]   Production URL the test will hit.
 *   Default `process.env.API_BASE || https://localit-nhattoann.vercel.app`.
 * @param {string[]} [opts.permissions]  Browser permissions to grant
 *   (e.g. `['microphone']`).
 * @param {object} [opts.extraHTTPHeaders]  Extra headers (e.g.
 *   `{'x-vercel-protection-bypass': BYPASS_TOKEN}`).
 */
export async function buildContext(browser, session, opts = {}) {
  const baseURL = opts.baseURL || process.env.API_BASE || 'https://localit-nhattoann.vercel.app'
  const hostname = new URL(baseURL).hostname
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`

  const ctxOpts = {
    baseURL,
    permissions: opts.permissions || [],
  }
  if (opts.extraHTTPHeaders) ctxOpts.extraHTTPHeaders = opts.extraHTTPHeaders
  const context = await browser.newContext(ctxOpts)

  // Build the SSR cookie value. Supabase chunks the base64-encoded
  // JSON at 3180 chars into `sb-<ref>-auth-token.0`, `.1`, …
  const value = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    expires_at:
      session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: session.user,
  })
  const encoded = Buffer.from(value, 'utf-8').toString('base64')
  const cookies = []
  const CHUNK = 3180
  if (encoded.length <= CHUNK) {
    cookies.push({
      name: storageKey,
      value: encoded,
      domain: hostname,
      path: '/',
      sameSite: 'Lax',
    })
  } else {
    let pos = 0
    let i = 0
    while (pos < encoded.length) {
      const piece = encoded.slice(pos, pos + CHUNK)
      const chunkName = i === 0 ? storageKey : `${storageKey}.${i}`
      cookies.push({
        name: chunkName,
        value: piece,
        domain: hostname,
        path: '/',
        sameSite: 'Lax',
      })
      i += 1
      pos += CHUNK
    }
  }
  await context.addCookies(cookies)

  // Seed localStorage so the client-side getSession() path matches.
  await context.addInitScript(
    ([key, val]) => {
      try {
        localStorage.setItem(key, val)
      } catch {}
    },
    [storageKey, value],
  )

  return context
}

/**
 * Convenience: sign in + build context in one shot.
 */
export async function signedInContext(browser, email, password, opts = {}) {
  const session = await signIn(email, password)
  return {
    context: await buildContext(browser, session, opts),
    session,
  }
}
