'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { readJwtClaimsSync, readUserIdFromToken } from '@/utils/supabase/client-binding'

export interface AuthUser {
  userId: string
  role: 'tourist' | 'buddy'
  fullName: string | undefined
  /**
   * Public avatar URL from `profiles.avatar_url`, or undefined when the
   * user never uploaded one. The header falls back to the name initial
   * when this is missing, so consumers must handle the empty case.
   */
  avatarUrl: string | undefined
}

/**
 * Module-level cache + subscriber set.
 *
 * WHY (2026-10-10)
 * `useAuthUser` is mounted SEVEN times on a single page: AuthAwareHeader,
 * GlobalIncomingCallWatcher, GlobalOnlineHeartbeat, GlobalPresenceMount,
 * GlobalMessagePopover, and AppShell itself
 * (for the `data-role` attribute on <main>). Each mount ran its own
 * effect and issued its own identical `profiles` query, so one
 * navigation to /tourists/<id> fired 20 identical requests inside a few
 * seconds.
 *
 * That storm was not just wasteful. The profile page mounts
 * `ConnectButton`, which has a hard 5-second window before its query has
 * to resolve; buried under 20 competing requests the `connections`
 * SELECT kept losing the connection pool, the component stayed on
 * "Checking connection status" forever, and the notification's
 * "Tap to review and respond" had nothing to land on.
 *
 * A shared cache collapses all seven mounts onto ONE request and one
 * shared subscription. RAM goes down too — one timer, one listener set,
 * one result object per page session instead of seven.
 */
type Listener = (user: AuthUser | null) => void

// 2026-10-20: SYNCHRONOUS seed from the JWT.
//
// Why: every reload used to flash the guest nav (Sign in / Create account)
// for 200-500 ms because `useAuthUser` initialised with `cached` = null,
// waited for `ensureLoaded()` to round-trip profiles, then re-rendered the
// header. The `role` attribute on <main>, the "Welcome back, John" heading,
// and the "Open account menu" avatar all popped in after the page was
// already painted.
//
// The JWT itself carries GoTrue's `sub` (user id) AND the `user_metadata`
// we set on signup (full_name, role). Decoding it costs ~0 ms and is read
// synchronously from the auth cookie. The cached value that powers the
// FIRST render now contains the right role/name, so the header shows the
// signed-in nav on frame 1 — the only frame a user sees.
// The profile query still runs to fetch the avatar, but that field does
// not change the chrome layout, so a null avatar during the first 200 ms
// is invisible.
let cached: AuthUser | null = (() => {
  const claims = readJwtClaimsSync()
  if (!claims?.userId || !claims.role) return null
  if (claims.role !== 'tourist' && claims.role !== 'buddy') return null
  return {
    userId: claims.userId,
    role: claims.role,
    fullName: claims.fullName ?? undefined,
    avatarUrl: undefined,
  }
})()
/** `undefined` = never loaded; `null` = loaded, signed out. */
let resolved = false
let inflight: Promise<AuthUser | null> | null = null
const listeners = new Set<Listener>()

/**
 * The `onAuthStateChange` subscription and the `localit-auth-changed`
 * listener are registered ONCE for the whole page session, not once per
 * consumer. Both are torn down only after the LAST consumer unmounts.
 */
let authBound = false
let boundSub: { data: { subscription: { unsubscribe: () => void } } } | null = null

function publish(user: AuthUser | null) {
  cached = user
  resolved = true
  for (const fn of listeners) {
    try {
      fn(user)
    } catch {
      /* a broken subscriber must not stop the others */
    }
  }
}

async function fetchProfile(userId: string): Promise<AuthUser | null> {
  try {
    const supabase = createClient()
    // 2026-10-20: only need the avatar_url — full_name + role are already
    // on the cached value from the JWT (see the seed at module top), and
    // re-reading them from profiles was costing one query per page
    // session. The cache stays null only for the AVATAR, which is the
    // only field that benefits from a fresh read.
    const { data: profile } = await supabase
      .from('profiles')
      .select('avatar_url')
      .eq('id', userId)
      .single()

    // If for some reason the JWT-derived cache wasn't set (older token,
    // missing user_metadata), fall back to the full profile read so we
    // can still render SOMETHING coherent.
    const cachedHere = cached
    if (!cachedHere) {
      const { data: full } = await supabase
        .from('profiles')
        .select('full_name, role, avatar_url')
        .eq('id', userId)
        .single()
      if (!full || (full.role !== 'tourist' && full.role !== 'buddy')) return null
      return {
        userId,
        role: full.role,
        fullName: full.full_name ?? undefined,
        avatarUrl: full.avatar_url ?? undefined,
      }
    }

    return {
      ...cachedHere,
      avatarUrl: profile?.avatar_url ?? cachedHere.avatarUrl,
    }
  } catch {
    return null
  }
}

function ensureLoaded() {
  // One in-flight request shared by every subscriber. Without this guard
  // seven mounts racing on first paint produced seven identical queries.
  if (inflight) return inflight

  inflight = (async () => {
    const myId = readUserIdFromToken()
    // CRITICAL: on sign-out (or when the session cookie is cleared) there
    // is no id. The old code left the previous user's state in place
    // forever, so AuthAwareHeader kept rendering the signed-in nav on
    // /login and GlobalOnlineHeartbeat kept firing `set_online_status`
    // with no session -> 401 on every beat. We must actively CLEAR.
    if (!myId) {
      publish(null)
      return null
    }
    // 2026-10-20: if the cached entry was seeded from the JWT, an
    // anonymous visitor must NOT see this user — re-publish as null.
    const seeded = readJwtClaimsSync()
    if (!seeded?.userId || seeded.userId !== myId) {
      publish(null)
      return null
    }
    const user = await fetchProfile(myId)
    publish(user)
    return user
  })().finally(() => {
    inflight = null
  })

  return inflight
}

/**
 * Invalidates the cache and re-resolves. Called on any auth event so a
 * sign-in / sign-out / token refresh updates every consumer at once.
 */
function reload() {
  resolved = false
  cached = null
  void ensureLoaded()
}

/**
 * Hook returning the currently authenticated user's id/role/name.
 *
 * Every mount shares one request and one result. Returns synchronously
 * from the cache when the value is already known, so the header renders
 * the right nav on first paint instead of flashing the signed-out one.
 */
export function useAuthUser(): AuthUser | null {
  const [user, setUser] = useState<AuthUser | null>(cached)

  useEffect(() => {
    let alive = true
    const listener: Listener = (next) => {
      if (alive) setUser(next)
    }
    listeners.add(listener)

    // Subscribe FIRST so an in-flight resolution still notifies us.
    void ensureLoaded().then((next) => {
      if (alive) setUser(next)
    })

    // The auth subscription is registered ONCE per page session, not once
    // per consumer. `onAuthStateChange` previously re-ran the whole load
    // in every one of the seven mounts.
    if (!authBound) {
      authBound = true
      boundSub = createClient().auth.onAuthStateChange(reload)
      window.addEventListener('localit-auth-changed', reload)
    }

    return () => {
      alive = false
      listeners.delete(listener)
      if (boundSub && listeners.size === 0) {
        boundSub.data.subscription.unsubscribe()
        window.removeEventListener('localit-auth-changed', reload)
        boundSub = null
        authBound = false
      }
    }
  }, [])

  return user
}

/** Test/reset helper — clears the shared cache without touching storage. */
export function __resetAuthUserCache() {
  cached = (() => {
    const claims = readJwtClaimsSync()
    if (!claims?.userId || !claims.role) return null
    if (claims.role !== 'tourist' && claims.role !== 'buddy') return null
    return {
      userId: claims.userId,
      role: claims.role,
      fullName: claims.fullName ?? undefined,
      avatarUrl: undefined,
    }
  })()
  resolved = false
  inflight = null
}

void resolved