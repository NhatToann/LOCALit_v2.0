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
   * the user's position over a Supabase Realtime broadcast channel.
   * When false (default), the hook only subscribes — no GPS prompt,
   * no publishing.
   */
  enabled?: boolean
  /** Minimum interval between self-position broadcasts (ms). Default 5000. */
  publishIntervalMs?: number
  /** How long a remote marker stays on the map without an update (ms). Default 60000. */
  staleAfterMs?: number
  /** Channel name. Default 'da-nang-live-locations'. */
  channelName?: string
}

const CHANNEL = 'da-nang-live-locations'

/**
 * Ephemeral live-location sharing for tourists on the same Da Nang map.
 *
 * - No DB writes. Positions live in a Supabase Realtime broadcast channel
 *   that exists only while at least one client is connected.
 * - When `enabled` flips to true we ask the browser for permission. If the
 *   user grants it we publish our own position; if they deny (or the API
 *   is unavailable) nothing happens — no fallback marker, no error UI.
 * - When `enabled` flips to false we stop publishing and remove ourselves
 *   from the channel.
 * - Subscribers see other users' markers in `liveLocations`. Stale entries
 *   (> staleAfterMs since last update) are evicted automatically.
 */
export function useLiveUserLocations(opts: Options = {}) {
  const {
    enabled = false,
    publishIntervalMs = 5_000,
    staleAfterMs = 60_000,
    channelName = CHANNEL,
  } = opts

  const [liveLocations, setLiveLocations] = useState<LiveLocation[]>([])
  const [selfGranted, setSelfGranted] = useState(false)
  const [selfDenied, setSelfDenied] = useState(false)
  const channelRef = useRef<any>(null)
  const userIdRef = useRef<string | null>(null)
  const nameRef = useRef<string>('You')
  const lastPublishRef = useRef<number>(0)
  const watchIdRef = useRef<number | null>(null)

  // Initialise channel + identity once on mount; keeps subscriptions alive
  // even if `enabled` toggles, so we never miss a peer update.
  useEffect(() => {
    let cancelled = false
    const supabase = createClient()
    const channel = supabase.channel(channelName, {
      config: { broadcast: { self: false }, presence: { key: '' } },
    })
    channelRef.current = channel

    channel.on('broadcast', { event: 'loc:update' }, (payload) => {
      const p = payload?.payload as Partial<LiveLocation> | undefined
      if (!p || typeof p.userId !== 'string') return
      if (p.userId === userIdRef.current) return
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') return
      const entry: LiveLocation = {
        userId: p.userId,
        name: typeof p.name === 'string' ? p.name : 'Tourist',
        lat: p.lat,
        lng: p.lng,
        ts: typeof p.ts === 'number' ? p.ts : Date.now(),
      }
      setLiveLocations(prev => {
        const next = prev.filter(e => e.userId !== entry.userId)
        next.push(entry)
        return next
      })
    })

    channel.on('broadcast', { event: 'loc:leave' }, (payload) => {
      const p = payload?.payload as { userId?: string } | undefined
      const id = p?.userId
      if (!id || id === userIdRef.current) return
      setLiveLocations(prev => prev.filter(e => e.userId !== id))
    })

    channel.subscribe()

    getCurrentUser().then(user => {
      if (cancelled) return
      userIdRef.current = user?.id ?? null
      nameRef.current =
        (user?.user_metadata?.full_name as string | undefined) ??
        (user?.email ? String(user.email).split('@')[0] : 'You')
    })

    // Periodic cleanup of stale entries
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
      const ch = channelRef.current
      channelRef.current = null
      if (ch) {
        try { ch.unsubscribe() } catch {}
        try { supabase.removeChannel(ch) } catch {}
      }
    }
  }, [channelName, staleAfterMs])

  // Toggle publish/subscribe on the local user based on `enabled`
  useEffect(() => {
    const channel = channelRef.current
    if (!channel) return

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

    function publish(lat: number, lng: number) {
      const now = Date.now()
      if (now - lastPublishRef.current < publishIntervalMs) return
      lastPublishRef.current = now
      const ch = channelRef.current
      if (!ch || !userIdRef.current) return
      ch.send({
        type: 'broadcast',
        event: 'loc:update',
        payload: {
          userId: userIdRef.current,
          name: nameRef.current,
          lat,
          lng,
          ts: now,
        },
      }).catch(() => {})
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

    // Use watchPosition (continuous) so the marker follows the user.
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
      // Best-effort leave broadcast
      const ch = channelRef.current
      const uid = userIdRef.current
      if (ch && uid) {
        try {
          ch.send({
            type: 'broadcast',
            event: 'loc:leave',
            payload: { userId: uid },
          })
        } catch {}
      }
    }
  }, [enabled, publishIntervalMs])

  // Window unload: tell peers we left.
  useEffect(() => {
    function onUnload() {
      const ch = channelRef.current
      const uid = userIdRef.current
      if (ch && uid) {
        try {
          ch.send({
            type: 'broadcast',
            event: 'loc:leave',
            payload: { userId: uid },
          })
        } catch {}
      }
    }
    window.addEventListener('beforeunload', onUnload)
    return () => window.removeEventListener('beforeunload', onUnload)
  }, [])

  return { liveLocations, selfGranted, selfDenied }
}
