'use client'

/**
 * useBackgroundCallService — DEPRECATED (2026-09-30).
 *
 * Historical role: keep an inbound signaling channel open on every
 * authenticated page so buddies can receive calls outside of /chat.
 *
 * Current approach (lib/webrtc/webrtc-client.ts `ensureInboundChannel`)
 * owns the inbound channel directly and is invoked by
 * startOutgoingCall / acceptIncomingCall. Mounting ANOTHER channel
 * here used to collide with the one webrtc-client.ts created (Supabase
 * closes the old channel when the same name is reused), causing
 * silent drop of inbound signaling.
 *
 * The store routing logic from this hook is preserved below, but
 * disabled. Future Phase 2 (background incoming popup across pages)
 * should re-introduce this with a separate channel name (e.g.
 * `inbox:${userId}`) that doesn't collide with the per-call
 * `calls:${userId}` channel.
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

export function BackgroundCallService({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) return
    // Signaling routing lives in lib/webrtc/webrtc-client.ts. No
    // separate channel here. We still expose the store for downstream
    // consumers that might inspect it.
    void activeCallStore.getState
    void createClient
    return undefined
  }, [userId])

  return null
}
