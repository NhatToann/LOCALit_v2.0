'use client'

/**
 * useFocusAutoMedia — auto-joins the always-on LiveKit mic room and
 * auto-publishes the user's location the moment they enter Focus Mode.
 *
 * Per the 2026-10-10 Focus Mode rewrite:
 *   - mic is ON by default (no ringing, no accept handshake)
 *   - location is shared by default with a toggle
 *   - both clean up on unmount (the user clicked End or the tab closed)
 *
 * The location toggle state is owned by the PARENT component so it
 * can be passed to both this hook and the map component. This avoids
 * a state-sync race between the header toggle and the map's
 * "location sharing" overlay.
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { startLiveKitCall } from '@/lib/webrtc/livekit-client'
import type { LiveKitCallClient, CallState } from '@/lib/webrtc/livekit-client'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'

export interface FocusAutoMediaState {
  /** LiveKit call state for the always-on mic ('idle' when not connected). */
  micState: CallState
  /** True when the published mic is currently muted. */
  micMuted: boolean
  /** Toggle mic mute. No-op if not connected. */
  toggleMic: () => void
  /** True when the geolocation permission has been granted + fix acquired. */
  locationShared: boolean
  /** True when the geolocation permission was denied. */
  locationDenied: boolean
  /** Other signed-in users sharing their live position. The same
   *  shape used by the dashboard's `useLiveUserLocations` hook, so
   *  the focus map can render identical markers. */
  liveLocations: import('@/hooks/useLiveUserLocations').LiveLocation[]
  /** Any error from the LiveKit handshake (e.g. token failure). */
  errorMessage: string | null
}

export function useFocusAutoMedia(opts: {
  enabled: boolean
  conversationId: string | null
  myId: string | null
  myName: string
  /** When true, broadcast the user's location to location_updates. */
  shareLocation: boolean
  selfUserId?: string | null
}): FocusAutoMediaState {
  const {
    enabled,
    conversationId,
    myId,
    myName,
    shareLocation,
    selfUserId = null,
  } = opts
  const [micState, setMicState] = useState<CallState>('idle')
  const [micMuted, setMicMuted] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const callClientRef = useRef<LiveKitCallClient | null>(null)
  const mountedRef = useRef(true)

  const { selfGranted, selfDenied, liveLocations } = useLiveUserLocations({
    enabled: enabled && shareLocation && myId !== null,
    selfUserId: myId ?? selfUserId,
  })

  // Mounted flag — used to ignore late async results after unmount.
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Track LiveKit state changes for the always-on mic.
  // LiveKit emits 'connecting' → 'connected' on a successful join.
  // Mic permission is prompted inside publishMic() — if the user
  // denies, the client throws a MicDeniedError, which we surface
  // via opts.onError.
  useEffect(() => {
    if (!enabled || !conversationId || !myId) {
      // Tear down any leftover client.
      const c = callClientRef.current
      if (c) {
        try {
          c.end()
        } catch {
          /* ignore */
        }
        callClientRef.current = null
      }
      if (mountedRef.current) {
        setMicState('idle')
        setMicMuted(false)
      }
      return
    }

    let cancelled = false
    setErrorMessage(null)
    setMicState('connecting')

    ;(async () => {
      try {
        const client = await startLiveKitCall({
          myId,
          roomName: `call:${conversationId}`,
          participantName: myName,
          video: false,
          onState: (s) => {
            if (!mountedRef.current || cancelled) return
            setMicState(s)
          },
          onRemoteStream: () => undefined,
          onLocalStream: () => undefined,
          onError: (e) => {
            if (!mountedRef.current || cancelled) return
            setErrorMessage(e.message)
            setMicState('failed')
          },
        })
        if (cancelled || !mountedRef.current) {
          try {
            client.end()
          } catch {
            /* ignore */
          }
          return
        }
        callClientRef.current = client
        // Auto-publish mic — the browser will prompt for permission
        // here. Per the 2026-10-10 design, the user wants the mic
        // ON by default, so we don't gate this behind a click.
        try {
          await client.publishMic()
        } catch (micErr) {
          if (mountedRef.current) {
            setErrorMessage(
              (micErr as Error).message || 'Microphone permission was denied.',
            )
            setMicState('failed')
          }
        }
      } catch (err) {
        if (mountedRef.current) {
          setErrorMessage((err as Error).message || 'Could not start the always-on mic.')
          setMicState('failed')
        }
      }
    })()

    return () => {
      cancelled = true
      const c = callClientRef.current
      if (c) {
        try {
          c.end()
        } catch {
          /* ignore */
        }
        callClientRef.current = null
      }
    }
  }, [enabled, conversationId, myId, myName])

  const toggleMic = useCallback(() => {
    const client = callClientRef.current
    if (!client) return
    const next = client.toggleMute()
    setMicMuted(next)
  }, [])

  return {
    micState,
    micMuted,
    toggleMic,
    locationShared: selfGranted,
    locationDenied: selfDenied,
    /** Other signed-in users sharing their live position (same
     *  shape as the dashboard's `useLiveUserLocations` return).
     *  Forwarded to the focus map so it can render the same
     *  "who's broadcasting right now" overlay the dashboard has. */
    liveLocations,
    errorMessage,
  }
}
