'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'

export interface LiveLocation {
  userId: string
  name: string
  lat: number
  lng: number
  ts: number
}

interface Options {
  /**
   * When true, the hook will request geolocation permission and publish
   * the user's position to public.location_updates (which is broadcast
   * to all subscribers via Supabase Realtime postgres_changes).
   * When false (default), the hook only subscribes — no GPS prompt, no
   * publishing.
   */
  enabled?: boolean
  /** Minimum interval between self-position writes (ms). Default 5000. */
  publishIntervalMs?: number
  /** How long a remote marker stays on the map without an update (ms). Default 60000. */
  staleAfterMs?: number
  /** Authenticated user id of the local user. When provided, the hook
   *  filters the publisher's own row out of the postgres_changes stream
   *  (in addition to the render-time filter in <MapView />), so the
   *  map never shows two pins for the broadcaster. If omitted, the
   *  hook falls back to its internal getCurrentUser() race. */
  selfUserId?: string | null
}

const STALE_AFTER_MS_DEFAULT = 60_000

/**
 * Live-location sharing for tourists on the same Da Nang map.
 *
 * 2026-10-10 update: module-scoped subscription registry.
 *
 * Background — the previous design called `supabase.channel(...)` +
 * `.on('postgres_changes', ...)` + `.subscribe()` from a `useEffect`
 * inside each hook instance. When more than one component on the
 * same page called the hook (e.g. /focus/[sessionId] via
 * useFocusAutoMedia AND a future call site), two distinct channel
 * objects with the same name would race to bind postgres_changes.
 * Supabase Realtime throws:
 *
 *   Error: cannot add `postgres_changes` callbacks for
 *   realtime:da-nang-live-locations-pg after `subscribe()`.
 *
 * It also throws on dep changes — `selfUserId` going from `null` →
 * real UUID (the common path: parent renders before the session
 * resolves) re-runs the effect, teardown starts `removeChannel` on
 * the old channel, but the new channel's `.subscribe()` resolves
 * first and binds a second postgres_changes handler. The next
 * `.on(...)` against the same channel name then throws.
 *
 * Fix: a single module-level subscription per channel name. Every
 * hook instance on the page calls `subscribeSharedLocationChannel`,
 * which refcounts and returns a listener-registration handle. The
 * underlying Realtime channel + postgres_changes binding is created
 * exactly once per page and torn down when the last subscriber
 * unmounts. Each subscriber gets its own onUpdate callback (and
 * their own initial-fetch promise), so individual components can
 * filter by their own selfUserId without breaking other consumers.
 *
 * Implementation (2026-10-07 — was using Realtime broadcast which turned
 * out to be unreliable in this environment; the WS handshake completed
 * but later broadcasts hit "Realtime send() is automatically falling back
 * to REST API" warnings, and the REST fallback returned 202 once then
 * ERR_ABORTED forever. Peers never received the marker.
 *
 * New approach: write to public.location_updates (the same table the
 * buddy dashboard already reads) and subscribe to postgres_changes on
 * that table. Two upserts per minute while the user has sharing on. The
 * row only lives as long as it's fresh; the periodic cleanup evicts
 * entries older than `staleAfterMs`.
 *
 *  - Buddies can read all location_updates (existing RLS policy).
 *  - Tourists can read their own + (after this rewrite) the most recent
 *    row per user where the sharer has opted in via this hook.
 */

// --- Module-scoped subscription registry ---------------------------------

type LocationEvent = {
  row: {
    user_id?: string
    latitude?: number
    longitude?: number
    updated_at?: string
  } | null
  eventType: 'INSERT' | 'UPDATE' | 'DELETE' | string
}

interface SubscriptionHandle {
  /** Unsubscribe this listener. The underlying channel is removed only
   *  when the last listener unsubscribes. */
  unsubscribe: () => void
  /** Whether the underlying channel is currently subscribed. Useful for
   *  diagnostics. */
  isActive: () => boolean
}

interface RegistryEntry {
  refCount: number
  channel: ReturnType<ReturnType<typeof createClient>['channel']>
  listeners: Set<(event: LocationEvent) => void>
  // Set of user_ids that have been seen since the last cleanup. The
  // dedupe logic per-subscriber runs in the listener callbacks; this
  // exists so we can name-backfill the most recent row for new
  // subscribers without re-fetching.
  seenUserIds: Set<string>
}

const REGISTRY = new Map<string, RegistryEntry>()

/**
 * subscribeSharedLocationChannel — the singleton subscription for
 * `da-nang-live-locations-pg`. The first caller creates the channel,
 * binds `postgres_changes`, and starts the subscription. Subsequent
 * callers increment the refcount and add their listener. Cleanup
 * decrements; when refcount hits 0, the channel is removed.
 */
function subscribeSharedLocationChannel(
  channelName: string,
  onEvent: (event: LocationEvent) => void,
): SubscriptionHandle {
  let entry = REGISTRY.get(channelName)
  if (!entry) {
    const supabase = createClient()
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'location_updates' },
        (payload) => {
          const e: LocationEvent = {
            row: (payload.new ?? payload.old) as LocationEvent['row'],
            eventType: payload.eventType,
          }
          const reg = REGISTRY.get(channelName)
          if (!reg) return
          for (const listener of reg.listeners) {
            try {
              listener(e)
            } catch {
              /* one bad listener doesn't take down the others */
            }
          }
        },
      )
      .subscribe()
    entry = { refCount: 0, channel, listeners: new Set(), seenUserIds: new Set() }
    REGISTRY.set(channelName, entry)
  }
  entry.listeners.add(onEvent)
  entry.refCount += 1
  return {
    unsubscribe() {
      const reg = REGISTRY.get(channelName)
      if (!reg) return
      reg.listeners.delete(onEvent)
      reg.refCount -= 1
      if (reg.refCount <= 0) {
        try {
          reg.channel.unsubscribe()
        } catch {
          /* ignore */
        }
        REGISTRY.delete(channelName)
      }
    },
    isActive() {
      return REGISTRY.has(channelName)
    },
  }
}

// The channel name is intentionally a constant so the registry can
// coalesce all consumers.
const LOCATION_CHANNEL = 'da-nang-live-locations-pg'

// --- Hook ----------------------------------------------------------------

export function useLiveUserLocations(opts: Options = {}) {
  const {
    enabled = false,
    publishIntervalMs = 5_000,
    staleAfterMs = STALE_AFTER_MS_DEFAULT,
    selfUserId = null,
  } = opts

  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([])
  const [selfGranted, setSelfGranted] = useState(false)
  const [selfDenied, setSelfDenied] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const userIdRef = useRef<string | null>(null)
  const nameRef = useRef<string>('You')
  const lastPublishRef = useRef<number>(0)
  const watchIdRef = useRef<number | null>(null)

  // Subscribe via the module-scoped registry. The effect intentionally
  // depends ONLY on `staleAfterMs` — `selfUserId` changes (null → real
  // id) used to re-subscribe and trigger the "cannot add postgres_changes
  // callbacks ... after subscribe()" error. The current user is now
  // tracked via a ref so the channel is bound exactly once per page.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabaseRef.current = supabase

    getCurrentUser().then((user) => {
      if (cancelled) return
      userIdRef.current = user?.id ?? null
      nameRef.current =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.email ? String(user.email).split('@')[0] : 'You')
    })

    // Also seed from the prop if the caller already knows the user id.
    // Stored in a ref so it doesn't trigger a re-subscribe.
    if (selfUserId) userIdRef.current = selfUserId

    // Initial fetch of recent live locations so we don't wait 5s for the
    // first realtime event. Same query every consumer used to issue
    // individually; we still do it per-instance because the result is
    // only 50 rows and RLS may return different results for different
    // sessions (tourists only see tourists + themselves).
    void (async () => {
      try {
        const { data } = await supabase
          .from('location_updates')
          .select(
            'user_id, latitude, longitude, updated_at, profile:safe_profiles(full_name)',
          )
          .order('updated_at', { ascending: false })
          .limit(50)
        if (cancelled || !data) return
        const now = Date.now()
        const seen = new Set<string>()
        const initial: LiveLocation[] = []
        for (const r of data as any[]) {
          if (seen.has(r.user_id)) continue
          if (r.user_id === userIdRef.current) continue
          seen.add(r.user_id)
          initial.push({
            userId: r.user_id,
            name: r.profile?.full_name ?? 'Tourist',
            lat: Number(r.latitude),
            lng: Number(r.longitude),
            ts: new Date(r.updated_at).getTime() || now,
          })
        }
        setLiveLocations(initial)
      } catch {
        /* ignore — RLS may block; we'll fall back to broadcasts below */
      }
    })()

    // Subscribe via the shared registry. The `postgres_changes` binding
    // happens exactly once per page; we just register a listener.
    const handle = subscribeSharedLocationChannel(LOCATION_CHANNEL, (event) => {
      const row = event.row
      if (!row || !row.user_id) return
      if (row.user_id === userIdRef.current) return
      if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') return
      if (event.eventType === 'DELETE') {
        setLiveLocations((prev) => prev.filter((e) => e.userId !== row.user_id))
        return
      }
      const ts = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
      setLiveLocations((prev) => {
        const existing = prev.find((e) => e.userId === row.user_id)
        const entry: LiveLocation = {
          userId: row.user_id!,
          name: existing?.name ?? 'Tourist',
          lat: Number(row.latitude),
          lng: Number(row.longitude),
          ts,
        }
        const next = prev.filter((e) => e.userId !== entry.userId)
        next.push(entry)
        return next
      })
    })

    // Periodic cleanup of stale entries.
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - staleAfterMs
      setLiveLocations((prev) => prev.filter((e) => e.ts >= cutoff))
    }, 10_000)

    return () => {
      cancelled = true
      clearInterval(cleanup)
      handle.unsubscribe()
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      supabaseRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staleAfterMs])

  // Toggle publish/subscribe on the local user based on `enabled`
  useEffect(() => {
    const supabase = supabaseRef.current
    if (!supabase) return

    if (!enabled) {
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      setSelfGranted(false)
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setSelfDenied(true)
      setSelfGranted(false)
      return
    }

    async function publish(lat: number, lng: number) {
      const now = Date.now()
      if (now - lastPublishRef.current < publishIntervalMs) return
      lastPublishRef.current = now
      const sb = supabaseRef.current
      let uid = userIdRef.current
      if (!sb) return
      // userIdRef is populated by getCurrentUser() which resolves async after
      // the channel is created. If publish fires before that resolves,
      // try a synchronous session peek first.
      if (!uid) {
        const { data } = await sb.auth.getUser()
        uid = data.user?.id ?? null
        if (uid) {
          userIdRef.current = uid
          nameRef.current =
            (data.user?.user_metadata?.full_name as string | undefined) ??
            (data.user?.email ? String(data.user.email).split('@')[0] : 'You')
        }
      }
      if (!uid) return
      // Update the user's existing row, or insert if none exists yet. We
      // use a separate UPDATE + INSERT instead of upsert because
      // location_updates doesn't have a UNIQUE constraint on user_id, and
      // adding one in a migration is risky (RLS + FK behavior). The race
      // is benign because both branches write the same user_id.
      const { data: existing, error: selErr } = await sb
        .from('location_updates')
        .select('id')
        .eq('user_id', uid)
        .limit(1)
        .maybeSingle()
      if (selErr) {
        if (process.env.NEXT_PUBLIC_CALL_DEBUG === '1') {
          // eslint-disable-next-line no-console
          console.log('[dlog] live-locations select failed:', selErr.message)
        }
        return
      }
      const payload = {
        user_id: uid,
        latitude: lat,
        longitude: lng,
        accuracy: null,
        updated_at: new Date(now).toISOString(),
      }
      const { error } = existing
        ? await sb.from('location_updates').update(payload).eq('id', existing.id)
        : await sb.from('location_updates').insert(payload)
      if (error && process.env.NEXT_PUBLIC_CALL_DEBUG === '1') {
        // eslint-disable-next-line no-console
        console.log('[dlog] live-locations write failed:', error.message)
      }
    }

    function onPos(pos: GeolocationPosition) {
      setSelfGranted(true)
      setSelfDenied(false)
      publish(pos.coords.latitude, pos.coords.longitude)
    }
    function onErr() {
      setSelfGranted(false)
      setSelfDenied(true)
    }

    // watchPosition (continuous) so the marker follows the user.
    // enableHighAccuracy=false keeps it battery-friendly for the demo.
    watchIdRef.current = navigator.geolocation.watchPosition(onPos, onErr, {
      enableHighAccuracy: false,
      timeout: 15000,
      maximumAge: 30000,
    })

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [enabled, publishIntervalMs])

  return { liveLocations, selfGranted, selfDenied }
}
