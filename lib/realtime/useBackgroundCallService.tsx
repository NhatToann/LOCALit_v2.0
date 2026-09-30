'use client'

/**
 * useBackgroundCallService — global signaling hub for WebRTC calls.
 *
 * Why this exists (2026-09-30):
 *   Previously Stringee's `IncomingCallWatcher` only worked when the
 *   buddy was on /chat because the Stringee client was only
 *   connected there. Buddies on /map, /browse, etc. were unreachable
 *   (`toType=external` → FROM_NUMBER_NOT_FOUND).
 *
 *   With the new self-hosted WebRTC stack (see
 *   lib/webrtc/webrtc-client.ts) the inbound signaling channel
 *   `calls:${userId}` needs to be subscribed to on EVERY authenticated
 *   page — not just /chat — so:
 *
 *     1. A buddy who is on /map can still receive the offer from a
 *        tourist who is on /chat.
 *     2. A user who is on /tourist/browse when a call arrives gets
 *        the popup (via IncomingCallWatcher + DB pending_calls).
 *     3. A user who is mid-call on /chat but navigates to /map
 *        continues to receive ICE/bye signaling.
 *
 *   This hook is mounted ONCE in AppShell. It owns the inbound
 *   signaling channel and routes messages to per-call handlers
 *   registered by the active call (see lib/realtime/useActiveCallStore).
 *
 *   The DB pending_calls row is still the durable source of truth for
 *   "ringing"; this hook only handles the in-flight WebRTC signaling.
 */

import { useEffect } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { activeCallStore } from '@/lib/realtime/useActiveCallStore'

interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'bye' | 'ring'
  callId: string
  from: string
  to: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

/**
 * Mount-once provider. Lives in AppShell.
 */
export function BackgroundCallService({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) return
    const supabase = createClient()
    const channel = supabase.channel(`calls:${userId}`, {
      config: { broadcast: { self: false, ack: false } },
    })

    channel.on('broadcast', { event: 'signal' }, (raw) => {
      const msg = raw.payload as SignalMessage | null
      if (!msg || !msg.callId) return
      const store = activeCallStore.getState()
      // Hand the message to the active call's handler if any.
      const handler = store.signalHandlers[msg.callId]
      if (handler) {
        try {
          handler(msg)
        } catch (err) {
          if (process.env.NODE_ENV !== 'production') {
            // eslint-disable-next-line no-console
            console.warn('[call:bg] handler threw', err)
          }
        }
      }
    })

    channel.subscribe()

    return () => {
      try {
        void supabase.removeChannel(channel)
      } catch {
        /* channel may already be gone */
      }
    }
  }, [userId])

  return null
}
