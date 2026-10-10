'use client'

import { useEffect, useRef } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/utils/supabase/auth'

/**
 * Bounces the reader to the login page the moment the Supabase session
 * dies, instead of leaving the app in a half-signed-in state.
 *
 * The reported symptom was a 401 from
 * `/rest/v1/reviews?select=reviewee_id…` followed by an app that was
 * stuck: the page finished rendering but clicking anything did nothing.
 *
 * Why that happens: the session cookie survives its access token. When
 * the access token expires, GoTrue only notices on the next request and
 * answers 401. Every page-level `load()` then does this:
 *
 *     const { data: { user } } = await supabase.auth.getUser()
 *     const me = authData.user?.id ?? null       // null
 *     … .neq('id', me ?? '00000000-…')            // filter on all-zero id
 *
 * `getUser()` returns `user: null` rather than throwing, so the null is
 * silently substituted with a sentinel UUID, the query runs against a
 * dead token and 401s, and the page settles into a rendered-but-empty
 * state. Middleware is no help either — it only runs on a server
 * request, and the SPA navigation the user is clicking never triggers it.
 *
 * `SIGNED_OUT` / `TOKEN_REFRESHED` are the events that actually describe
 * this transition, so we listen for them once here rather than adding
 * error branches to every `load()` in the app.
 *
 * The 401 response is also worth catching on its own: it can arrive
 * before GoTrue emits `SIGNED_OUT`, and it is the signal that
 * distinguishes "your session died" from a normal RLS denial on a
 * single query.
 */
export default function SessionExpiryGuard() {
  const router = useRouter()
  const pathname = usePathname()
  // Guards against two things: a redirect firing more than once for the
  // same dead session, and the redirect loop when /login itself mounts
  // this component and finds no session.
  const redirectedRef = useRef(false)

  useEffect(() => {
    let cancelled = false

    const sendToLogin = (reason: string) => {
      if (cancelled || redirectedRef.current) return
      if (pathname.startsWith('/login') || pathname.startsWith('/register')) return
      redirectedRef.current = true
      if (process.env.NODE_ENV !== 'production') {
        console.warn(`[session] redirecting to /login: ${reason}`)
      }
      // `replace` so Back does not bounce straight back into the page
      // that just failed.
      router.replace(`/login?reason=expired&next=${encodeURIComponent(pathname)}`)
    }

    const supabase = createClient()

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' && !session) {
        sendToLogin('auth event SIGNED_OUT')
      }
      // A successful refresh clears the latch, so a later real expiry
      // redirects again instead of being silently swallowed.
      if (event === 'TOKEN_REFRESHED' && session) {
        redirectedRef.current = false
      }
    })

    // A 401 from the REST API is the earliest observable sign that the
    // access token is dead — GoTrue can take a moment to emit
    // SIGNED_OUT afterwards. Supabase does not surface per-request
    // status codes as auth errors, so we wrap `fetch` instead.
    //
    // A `response` event listener on window is NOT sufficient: fetch
    // does not bubble its events, and only Firefox implements
    // ResponseEvent at all. Patching fetch is the one approach that
    // works across every browser we target.
    const originalFetch = window.fetch.bind(window)
    window.fetch = async (...args) => {
      const res = await originalFetch(...args)
      if (res.status === 401) {
        const input = args[0]
        const url =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.href
              : (input?.url ?? '')
        if (url.includes('/rest/v1/') || url.includes('/auth/v1/')) {
          sendToLogin(`401 from ${url.split('?')[0].split('/').pop()}`)
        }
      }
      return res
    }

    // Also check once on mount: a tab restored from bfcache or opened
    // after the token died elsewhere will emit no auth event at all.
    void supabase.auth.getSession().then(({ data }) => {
      if (!data.session) sendToLogin('no session on mount')
    })

    return () => {
      cancelled = true
      window.fetch = originalFetch
      sub.subscription.unsubscribe()
    }
  }, [pathname, router])

  return null
}