'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/auth'

/**
 * Redirects to the login page when the Supabase session is gone, instead
 * of leaving the reader on a page whose queries all 401.
 *
 * Reported symptom: a 401 from `/rest/v1/reviews?select=reviewee_id…`
 * followed by an app that would not respond to clicks.
 *
 * WHY THE APP USED TO STRAND THE READER
 * -------------------------------------
 * `getUser()` returns `user: null` rather than throwing when the session
 * is dead, and pages were substituting a sentinel:
 *
 *     const me = authData.user?.id ?? null
 *     … .neq('id', me ?? '00000000-0000-0000-0000-000000000000')
 *
 * so the query ran against an expired bearer token, 401'd, and the page
 * settled into a rendered-but-empty state. Middleware cannot catch it —
 * it only runs on server requests, and SPA navigation never triggers it.
 *
 * WHAT IS DELIBERATELY NOT DONE HERE
 * ----------------------------------
 * An earlier revision of this file fired on ANY 401 from /rest/v1/ and
 * also checked `getSession()` on every mount. Both were wrong and both
 * broke sign-in:
 *
 *  - The `/auth/v1/token` refresh call is itself a 401 when a session is
 *    legitimately renewed, and GoTrue briefly removes the session while
 *    it re-validates. Redirecting on that turned a successful
 *    sign-in into a bounce straight back to the login form.
 *  - A no-session check on mount fires on PUBLIC pages. /browse, /map
 *    and / are readable without an account, so a guest reading the
 *    homepage was dragged to /login.
 *
 * So the trigger is narrowed to events that actually mean "this session
 * is unrecoverable", and the guard is a no-op on public routes.
 */

// Same list the middleware uses. On these routes a missing session is
// the normal state, not a fault.
const PUBLIC_ROUTES = ['/', '/browse', '/map', '/search']
const isPublicRoute = (p: string) =>
  PUBLIC_ROUTES.includes(p) ||
  p.startsWith('/buddies/') ||
  p.startsWith('/login') ||
  p.startsWith('/register') ||
  p.startsWith('/forgot-password') ||
  p.startsWith('/reset-password')

export default function SessionExpiryGuard() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // Nothing to protect on a public page.
    if (isPublicRoute(pathname)) return

    let cancelled = false
    let redirected = false

    const sendToLogin = (reason: string) => {
      if (cancelled || redirected) return
      redirected = true
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[session] redirecting to /login: ${reason}`)
      }
      // `replace` so Back does not return to the page that just failed.
      router.replace(`/login?reason=expired&next=${encodeURIComponent(pathname)}`)
    }

    const supabase = createClient()

    // The single reliable signal. GoTrue emits SIGNED_OUT when it has
    // decided the session cannot be recovered — after a failed refresh,
    // a revoked session, or an explicit sign-out from another tab. It
    // does NOT fire during a normal refresh, so a successful token
    // renewal cannot be mistaken for an expiry.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !session) {
        sendToLogin('auth event SIGNED_OUT')
      }
    })

    // Covers the case where the session died while the tab was closed or
    // backgrounded, so no auth event was ever delivered. Only queried on
    // authenticated routes — on a public page "no session" is expected.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) sendToLogin('no session on mount')
    })

    return () => {
      cancelled = true
      sub.subscription.unsubscribe()
    }
  }, [pathname, router])

  return null
}