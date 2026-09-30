'use client'

/**
 * ActiveCallSheet — globally-mounted call UI.
 *
 * Lives in AppShell so the call persists across page navigations
 * (previously the modal lived only in app/chat/page.tsx — leaving
 * /chat mid-call dropped the modal and stranded the user).
 *
 * Reads state from useActiveCallStore. The store is updated by:
 *   - chat page's startCall() / acceptCall() for outgoing/incoming
 *   - BackgroundCallService for inbound signaling routing
 *
 * The actual WebRTC peer connection is owned by `client` from
 * lib/webrtc/webrtc-client.ts; this component just renders the UI.
 */

import { useEffect, useRef, useState } from 'react'
import { useActiveCall, activeCallStore } from '@/lib/realtime/useActiveCallStore'
import CallModal from '@/components/chat/CallModal'
import type { CallClient, CallMode } from '@/lib/webrtc/webrtc-client'
import type { CallQuality } from '@/lib/realtime/useActiveCallStore'

export default function ActiveCallSheet() {
  const active = useActiveCall()
  const [client, setClient] = useState<CallClient | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [quality, setQuality] = useState<CallQuality | null>(null)

  // When the active call changes, look up the CallClient from the
  // chat page's local state. We do this via a window-level registry
  // set by the chat page (avoids circular store ↔ hook coupling).
  useEffect(() => {
    if (!active) {
      setClient(null)
      return
    }
    const registry = (window as unknown as {
      __localitCallClients?: Record<string, CallClient>
    }).__localitCallClients
    const c = registry?.[active.callId] ?? null
    setClient(c)

    // Periodically read the latest client from the registry (the chat
    // page may attach it asynchronously after Accept).
    const interval = setInterval(() => {
      const reg = (window as unknown as {
        __localitCallClients?: Record<string, CallClient>
      }).__localitCallClients
      const next = reg?.[active.callId] ?? null
      setClient(next)
    }, 500)
    return () => clearInterval(interval)
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

  // Pull quality from the client's polling. We rely on the chat page
  // (which owns the CallClient) forwarding quality updates to the
  // store via patchActive. For the ActiveCallSheet alone, we read
  // directly from the client when mounted.
  useEffect(() => {
    if (!client) return
    setQuality(null)
    const id = setInterval(async () => {
      try {
        const pc = client.peerConnection
        if (!pc) return
        const stats = await pc.getStats()
        let inboundBytes = 0
        let packetsLost = 0
        let packetsReceived = 0
        let rtt = 0
        let bytesPrev = 0
        let tsPrev = 0
        stats.forEach((report) => {
          if (report.type === 'inbound-rtp' && report.kind === 'audio') {
            inboundBytes += Number(report.bytesReceived ?? 0)
            packetsLost += Number(report.packetsLost ?? 0)
            packetsReceived += Number(report.packetsReceived ?? 0)
          }
          if (report.type === 'candidate-pair' && report.state === 'succeeded') {
            rtt = Number(report.currentRoundTripTime ?? 0) * 1000
          }
          // Also remember the last bytesReceived timestamp for delta
          // computation. (We use a single-shot sample here; the
          // dedicated useCallQuality hook in the chat page is more
          // accurate.)
          if (report.type === 'inbound-rtp') {
            bytesPrev = Number(report.bytesReceived ?? 0)
            tsPrev = Number(report.timestamp ?? 0)
          }
        })
        const bitrateKbps = inboundBytes / 1000 // coarse
        const packetLossPct =
          packetsReceived > 0 ? (packetsLost / packetsReceived) * 100 : 0
        const level: CallQuality['level'] =
          bitrateKbps >= 50 && packetLossPct < 2 && rtt < 80
            ? 'excellent'
            : bitrateKbps >= 30 && packetLossPct < 5 && rtt < 150
              ? 'good'
              : bitrateKbps >= 16 && packetLossPct < 10 && rtt < 250
                ? 'fair'
                : 'poor'
        setQuality({ level, bitrateKbps, rttMs: rtt, packetLossPct })
        void bytesPrev
        void tsPrev
      } catch {
        /* swallow */
      }
    }, 2000)
    return () => clearInterval(id)
  }, [client])

  if (!active) return null

  return (
    <>
      {/* Hidden audio element for the remote stream — the chat page
          also attaches its own, but we keep one here so the audio
          survives when the user navigates away. The chat page's
          startOutgoingCall/acceptIncomingCall set srcObject on
          whichever <audio> is mounted in the active tree at the
          time the track arrives; for cross-page survival we rely
          on the chat page forwarding via the registry. */}
      <audio ref={audioRef} className="hidden" aria-hidden="true" />
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
