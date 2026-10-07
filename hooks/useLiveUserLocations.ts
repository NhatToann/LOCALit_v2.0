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
}

const STALE_AFTER_MS_DEFAULT = 60_000

/**
 * Live-location sharing for tourists on the same Da Nang map.
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
export function useLiveUserLocations(opts: Options = {}) {
  const { enabled = false, publishIntervalMs = 5_000, staleAfterMs = STALE_AFTER_MS_DEFAULT } = opts

  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([])
  const [selfGranted, setSelfGranted] = useState(false)
  const [selfDenied, setSelfDenied] = useState(false)
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null)
  const userIdRef = useRef<string | null>(null)
  const nameRef = useRef<string>('You')
  const lastPublishRef = useRef<number>(0)
  const watchIdRef = useRef<number | null>(null)

  // Subscribe to location_updates postgres_changes once on mount.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    supabaseRef.current = supabase

    getCurrentUser().then(user => {
      if (cancelled) return
      userIdRef.current = user?.id ?? null
      nameRef.current =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.email ? String(user.email).split('@')[0] : 'You')
    })

    // Initial fetch of recent live locations so we don't wait 5s for the
    // first realtime event.
    ;(async () => {
      try {
        const { data } = await supabase
          .from('location_updates')
          .select('user_id, latitude, longitude, updated_at, profile:safe_profiles(full_name)')
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

    const channel = supabase
      .channel('da-nang-live-locations-pg')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'location_updates' },
        (payload) => {
          // eslint-disable-next-line no-console
          console.log('[live-locations] postgres_changes received', JSON.stringify(payload).slice(0, 200))
          const row = (payload.new ?? payload.old) as
            | { user_id?: string; latitude?: number; longitude?: number; updated_at?: string }
            | null
          if (!row || !row.user_id) return
          if (row.user_id === userIdRef.current) return
          if (typeof row.latitude !== 'number' || typeof row.longitude !== 'number') return
          if (payload.eventType === 'DELETE') {
            setLiveLocations(prev => prev.filter(e => e.userId !== row.user_id))
            return
          }
          const ts = row.updated_at ? new Date(row.updated_at).getTime() : Date.now()
          // Look up the name from existing state; fall back to 'Tourist'.
          setLiveLocations(prev => {
            const existing = prev.find(e => e.userId === row.user_id)
            const entry: LiveLocation = {
              userId: row.user_id!,
              name: existing?.name ?? 'Tourist',
              lat: Number(row.latitude),
              lng: Number(row.longitude),
              ts,
            }
            const next = prev.filter(e => e.userId !== entry.userId)
            next.push(entry)
            return next
          })
        },
      )
      .subscribe()

    // Periodic cleanup of stale entries.
    const cleanup = setInterval(() => {
      const cutoff = Date.now() - staleAfterMs
      setLiveLocations(prev => prev.filter(e => e.ts >= cutoff))
    }, 10_000)

    return () => {
      cancelled = true
      clearInterval(cleanup)
      if (watchIdRef.current !== null && typeof navigator !== 'undefined') {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      const supabase = supabaseRef.current
      supabaseRef.current = null
      if (supabase && channel) {
        try {
          supabase.removeChannel(channel)
        } catch {
          /* ignore */
        }
      }
    }
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
      // eslint-disable-next-line no-console
      console.log('[live-locations] publish attempt', { uid, lat, lng })
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
      if (error) {
        // eslint-disable-next-line no-console
        console.log('[live-locations] write failed:', error.message, error.code)
      } else {
        // eslint-disable-next-line no-console
        console.log('[live-locations] write OK')
      }
    }

    function onPos(pos: GeolocationPosition) {
      setSelfGranted(true)
      setSelfDenied(false)
      // eslint-disable-next-line no-console
      console.log('[live-locations] got position', pos.coords.latitude, pos.coords.longitude)
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