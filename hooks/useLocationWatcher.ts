'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'

interface Options {
  /** Called once geolocation is granted and we have a fix. */
  onGranted?: () => void
  /** Called if user denies or geolocation is unavailable. */
  onDenied?: () => void
  /** Auto-write location to `location_updates` table (default true). */
  writeToDb?: boolean
  /** Minimum time between DB writes in ms (default 60_000). */
  minWriteIntervalMs?: number
}

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 } // Da Nang fallback

/**
 * Returns the user's current geolocation, falling back to Da Nang if denied.
 *
 * By default this hook is READ-ONLY — it does NOT write to the database.
 * If you ever need to persist positions, pass `writeToDb: true` explicitly.
 * For ephemeral real-time sharing use `useLiveUserLocations` instead.
 */
export function useLocationWatcher(opts: Options = {}) {
  const { onGranted, onDenied, writeToDb = false, minWriteIntervalMs = 60_000 } = opts
  const [location, setLocation] = useState(DEFAULT_LOCATION)
  const lastWriteRef = useRef<number>(0)
  const userIdRef = useRef<string | null>(null)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      onDenied?.()
      return
    }

    let cancelled = false

    // Pre-fetch user id so we don't query for it on every position update
    createClient().auth.getUser().then(({ data }) => {
      if (!cancelled) userIdRef.current = data.user?.id ?? null
    })

    function handlePosition(pos: GeolocationPosition) {
      const next = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      setLocation(next)
      onGranted?.()

      if (!writeToDb || !userIdRef.current) return
      const now = Date.now()
      if (now - lastWriteRef.current < minWriteIntervalMs) return
      lastWriteRef.current = now

      createClient()
        .from('location_updates')
        .insert({
          user_id: userIdRef.current,
          latitude: next.lat,
          longitude: next.lng,
          accuracy: pos.coords.accuracy,
        })
        .then(() => {/* ignore errors silently */})
    }

    function handleError() {
      onDenied?.()
    }

    const id = navigator.geolocation.watchPosition(handlePosition, handleError, {
      enableHighAccuracy: true,
      timeout: 30000,
      maximumAge: 60000,
    })

    return () => {
      cancelled = true
      navigator.geolocation.clearWatch(id)
    }
  }, [onGranted, onDenied, writeToDb, minWriteIntervalMs])

  return location
}

export { DEFAULT_LOCATION }
