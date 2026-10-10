'use client'

/**
 * useFocusLocation — the location-sharing half of the original
 * `useFocusAutoMedia` hook, kept now that the always-on mic is gone
 * from Focus Mode (per user request 2026-10-10).
 *
 * Why a separate hook: the focus page already needed a
 * `useLiveUserLocations` consumer, and putting it in a dedicated
 * hook means the page component doesn't have to know the
 * implementation detail of "publish + subscribe share the same
 * hook". The map child reads from the parent's return via prop
 * drilling.
 *
 * What this hook does:
 *  - When `enabled && shareLocation && selfUserId !== null`, calls
 *    `useLiveUserLocations` so the user broadcasts their own
 *    position AND receives every other broadcaster's position.
 *  - When disabled, no GPS prompt, no subscription, no realtime
 *    overhead.
 *  - Cleans up the geolocation watch on unmount and on toggle-off
 *    (delegated to the underlying hook).
 *
 * It deliberately does NOT join a LiveKit room anymore — the audio
 * layer was removed (the user wants Focus to be silent; the
 * voice-call path lives in /chat instead).
 */

import { useLiveUserLocations, type LiveLocation } from '@/hooks/useLiveUserLocations'

export interface FocusLocationState {
  /** True when geolocation permission is granted and we have a fix. */
  locationShared: boolean
  /** True when geolocation permission was denied. */
  locationDenied: boolean
  /** Other signed-in users sharing their live position right now. */
  liveLocations: LiveLocation[]
}

export function useFocusLocation(opts: {
  /** When true, the hook tries to publish + subscribe. When false,
   *  the hook is a no-op (no GPS prompt, no Realtime channel). */
  enabled: boolean
  /** Authenticated user id — passed straight through to
   *  useLiveUserLocations so the broadcaster's own row is filtered
   *  out of the postgres_changes stream. */
  selfUserId: string | null
  /** When true, broadcast the user's location. When false, only
   *  receive. */
  shareLocation: boolean
}): FocusLocationState {
  const { enabled, selfUserId, shareLocation } = opts
  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: enabled && shareLocation && selfUserId !== null,
    selfUserId,
  })

  return {
    locationShared: selfGranted,
    locationDenied: selfDenied,
    liveLocations,
  }
}
