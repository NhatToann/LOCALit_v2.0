'use client'

/**
 * ActiveCallSheet — globally-mounted call UI.
 *
 * Lives in AppShell so the call UI persists across page navigations.
 *
 * The WebRTC peer connection is owned by the chat page
 * (startOutgoingCall/acceptIncomingCall in lib/webrtc/webrtc-client.ts).
 * To share the client across components without prop drilling, we use
 * a module-level Map keyed by callId. The chat page registers the
 * client immediately after creating it, and unregisters it on
 * end/decline. ActiveCallSheet polls this Map every 250ms when an
 * active call exists.
 *
 * Why not put the client in useActiveCallStore?
 *   The store uses useSyncExternalStore which requires a serializable
 *   snapshot. CallClient holds a live RTCPeerConnection which is not
 *   safe to clone or compare structurally. Keeping it in a side
 *   Map (this file) avoids that pitfall while still allowing
 *   cross-component access.
 */

import { useEffect, useRef, useState } from 'react'
import { useActiveCall, activeCallStore } from '@/lib/realtime/useActiveCallStore'
import CallModal from '@/components/chat/CallModal'
import type { LiveKitCallClient } from '@/lib/webrtc/livekit-client'
import type { CallQuality } from '@/lib/realtime/useActiveCallStore'

type CallMode = 'voice'

/**
 * Module-level registry of live CallClient objects. Keyed by callId.
 * The chat page registers a client after creating it; ActiveCallSheet
 * reads from this registry.
 *
 * This intentionally lives at module scope (not in the store) because
 * RTCPeerConnection is not serializable.
 */
const clientRegistry: Map<string, LiveKitCallClient> = new Map()

/**
 * Public API for the chat page to register/unregister live clients.
 */
export function registerActiveCallClient(callId: string, client: LiveKitCallClient): void {
  clientRegistry.set(callId, client)
}

export function unregisterActiveCallClient(callId: string): void {
  clientRegistry.delete(callId)
}

/** Test/debug — clear the registry. */
export function __resetActiveCallRegistryForTests(): void {
  clientRegistry.clear()
}

export default function ActiveCallSheet() {
  const active = useActiveCall()
  const [client, setClient] = useState<LiveKitCallClient | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [quality, setQuality] = useState<CallQuality | null>(null)

  // Resolve the CallClient from the registry. Poll every 250ms while
  // an active call exists because the client may be created
  // asynchronously after the store is updated (Accept path).
  useEffect(() => {
    if (!active) {
      setClient(null)
      return
    }
    const update = () => {
      const c = clientRegistry.get(active.callId) ?? null
      setClient((prev) => (prev === c ? prev : c))
    }
    update()
    const id = setInterval(update, 250)
    return () => clearInterval(id)
  }, [active?.callId])

  // Drive the duration timer.
  useEffect(() => {
    if (!active || active.state !== 'connected') return
    const startedAt = active.startedAt
    const tick = () => setDuration(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active?.state, active?.startedAt])

  // Compute quality directly from the client's peer connection while
  // connected. We poll getStats() every 2s.
  useEffect(() => {
    // LiveKit manages its own connection stats and exposes them
    // through Room.engine.client. We don't compute quality here —
    // the UI will simply show "—" instead of bitrate/RTT when no
    // override is supplied.
    if (!client || active?.state !== 'connected') {
      setQuality(null)
      return
    }
    return undefined
  }, [client, active?.state])

  if (!active) return null

  return (
    <>
      {/* Hidden audio sink. The chat page also attaches its own
          <audio>; this one is used when the modal survives a page
          navigation (chat page's audio element is unmounted). */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" aria-hidden="true" />
      <CallModal
        client={client}
        mode={'voice' as CallMode}
        partnerName={active.partnerName}
        partnerAvatar={active.partnerAvatar}
        isOutgoing={active.isOutgoing}
        state={active.state}
        errorMessage={active.errorMessage}
        audioRef={audioRef}
        qualityOverride={quality}
        durationOverride={duration}
        onEnd={() => {
          if (client) void client.end()
          activeCallStore.setActive(null)
        }}
      />
    </>
  )
}