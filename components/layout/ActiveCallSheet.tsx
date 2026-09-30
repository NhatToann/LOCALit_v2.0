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
import type { CallClient, CallMode } from '@/lib/webrtc/webrtc-client'
import type { CallQuality } from '@/lib/realtime/useActiveCallStore'

/**
 * Module-level registry of live CallClient objects. Keyed by callId.
 * The chat page registers a client after creating it; ActiveCallSheet
 * reads from this registry.
 *
 * This intentionally lives at module scope (not in the store) because
 * RTCPeerConnection is not serializable.
 */
const clientRegistry: Map<string, CallClient> = new Map()

/**
 * Public API for the chat page to register/unregister live clients.
 */
export function registerActiveCallClient(callId: string, client: CallClient): void {
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
  const [client, setClient] = useState<CallClient | null>(null)
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
    if (!client || active?.state !== 'connected') {
      setQuality(null)
      return
    }
    let prevBytes = 0
    let prevTs = 0
    let prevLost = 0
    let prevReceived = 0
    const tick = async () => {
      try {
        const pc = client.peerConnection
        if (!pc) return
        const stats = await pc.getStats()
        let inboundBytes = 0
        let packetsLost = 0
        let packetsReceived = 0
        let rtt = 0
        let tsNow = 0
        stats.forEach((report) => {
          const r = report as Record<string, unknown>
          if (r.type === 'inbound-rtp' && r.kind === 'audio') {
            inboundBytes += Number(r.bytesReceived ?? 0)
            packetsLost += Number(r.packetsLost ?? 0)
            packetsReceived += Number(r.packetsReceived ?? 0)
            tsNow = Number(r.timestamp ?? Date.now())
          }
          if (r.type === 'candidate-pair' && r.state === 'succeeded') {
            rtt = Number(r.currentRoundTripTime ?? 0) * 1000
          }
        })
        // Compute deltas if we have a previous sample.
        let bitrateKbps = 0
        if (prevTs > 0 && tsNow > prevTs) {
          const deltaBytes = inboundBytes - prevBytes
          const deltaSec = (tsNow - prevTs) / 1000
          if (deltaSec > 0) bitrateKbps = (deltaBytes * 8) / 1000 / deltaSec
        }
        const deltaLost = Math.max(0, packetsLost - prevLost)
        const deltaReceived = Math.max(0, packetsReceived - prevReceived)
        const packetLossPct =
          deltaReceived > 0 ? (deltaLost / deltaReceived) * 100 : 0
        const level: CallQuality['level'] =
          bitrateKbps >= 50 && packetLossPct < 2 && rtt < 80
            ? 'excellent'
            : bitrateKbps >= 30 && packetLossPct < 5 && rtt < 150
              ? 'good'
              : bitrateKbps >= 16 && packetLossPct < 10 && rtt < 250
                ? 'fair'
                : 'poor'
        setQuality({ level, bitrateKbps, rttMs: rtt, packetLossPct })
        prevBytes = inboundBytes
        prevTs = tsNow
        prevLost = packetsLost
        prevReceived = packetsReceived
      } catch {
        /* swallow */
      }
    }
    const id = setInterval(() => void tick(), 2000)
    return () => clearInterval(id)
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