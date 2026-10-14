import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

/**
 * GET /api/auth/redirect-diagnostics
 *
 * Reports the auth redirect configuration so an operator can verify the
 * password-reset flow without guessing.
 *
 * IMPORTANT — what this can and cannot tell you (verified 2026-10-10)
 * --------------------------------------------------------------------
 * GoTrue exposes the Redirect URL allowlist ONLY through the Supabase
 * Dashboard or the Management API (requires a personal access token).
 * Neither `GET /auth/v1/settings` nor the PostgREST API returns it — the
 * column lives in GoTrue's own `auth.config` table, which is not exposed
 * over SQL for anon/authenticated/service-role clients alike.
 *
 * So this endpoint deliberately does NOT claim to have read the
 * allowlist. It reports:
 *   - which URLs the app WILL request (the thing it fully controls)
 *   - whether Supabase is reachable with the configured anon key
 *   - the exact strings that must exist in the Dashboard
 *
 * `allowlistReadable: false` is the honest signal that the Dashboard must
 * be checked by hand. A previous version of this endpoint implied the
 * check had been performed, which was misleading.
 */

const REQUIRED = [
  'https://localit-nhattoann.vercel.app/reset-password',
  'https://localit-vn.vercel.app/reset-password',
]

export async function GET() {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim() || null

  return NextResponse.json({
    ok: true,

    /** Origin the app pins for auth redirects, ignoring the current
     *  deployment hostname. Matches resolveAuthOrigin() in auth.ts. */
    redirectOrigin: configured
      ? configured.replace(/\/$/, '')
      : 'https://localit-nhattoann.vercel.app',

    /** The full URL sent as `redirect_to` by resetPasswordForEmail. */
    redirectUrlSent: `${
      configured
        ? configured.replace(/\/$/, '')
        : 'https://localit-nhattoann.vercel.app'
    }/reset-password`,

    /** Copy these verbatim into Supabase → Auth → URL Configuration. */
    requiredRedirectUrls: REQUIRED,

    /**
     * Honest flag: the allowlist is NOT machine-readable through any
     * client-facing API. An operator must confirm it in the Dashboard.
     */
    allowlistReadable: false,

    /**
     * True when the app can no longer emit an off-allowlist URL on its
     * own — i.e. it always pins a stable alias instead of whatever
     * deployment hostname the user happened to arrive on.
     */
    pinnedToStableOrigin: true,

    supabaseReachable: await pingSupabase(),

    dashboardUrl:
      'https://supabase.com/dashboard/project/pqvnjgyqbxlylawwogjv/auth/url-configuration',

    note:
      'GoTrue discards a redirect_to that is not on the allowlist and ' +
      'redirects to the Site URL root with ?error=access_denied. ' +
      '/reset-password must be listed explicitly — the bare origin is NOT enough.',
  })
}

async function pingSupabase(): Promise<boolean> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) return false
  try {
    const res = await fetch(`${url}/auth/v1/settings`, {
      headers: { apikey: key },
      cache: 'no-store',
    })
    return res.ok
  } catch {
    return false
  }
}