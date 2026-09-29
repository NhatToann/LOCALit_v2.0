/**
 * useCallQuality — poll `RTCPeerConnection.getStats()` and report a
 * coarse `CallQuality` snapshot every 2s.
 *
 * Used by `CallModal` to render the "Signal · 64 kbps · 12 ms" strip
 * while the call is in the `connected` state. The hook is a pure
 * stats reader. It does NOT depend on the Stringee SDK — only on the
 * standard `RTCPeerConnection` exposed by `CallClient.peerConnection`.
 *
 * Browser support: `RTCPeerConnection.getStats()` is universally
 * available in modern browsers (Chrome 24+, Firefox 27+, Safari 11+).
 *
 * Thresholds for `level`:
 *   - excellent: bitrate >= 50 kbps AND loss < 2% AND rtt < 80 ms
 *   - good:      bitrate >= 30 kbps AND loss < 5% AND rtt < 150 ms
 *   - fair:      bitrate >= 16 kbps AND loss < 10% AND rtt < 250 ms
 *   - poor:      anything else
 *
 * These thresholds are calibrated for Opus voice at 32 kbps (the
 * typical Stringee default). They err on the side of optimism so
 * short blips don't downgrade the quality mid-call.
 */

import { useEffect, useRef } from 'react'
import type { CallQuality, CallQualityLevel } from './call-client'

const POLL_INTERVAL_MS = 2_000

/**
 * Map raw stats to a coarse quality level. Encapsulated so we can
 * tune thresholds in one place.
 */
function classifyQuality(
  bitrateKbps: number,
  packetLossPct: number,
  rttMs: number,
): CallQualityLevel {
  if (bitrateKbps >= 50 && packetLossPct < 2 && rttMs < 80) return 'excellent'
  if (bitrateKbps >= 30 && packetLossPct < 5 && rttMs < 150) return 'good'
  if (bitrateKbps >= 16 && packetLossPct < 10 && rttMs < 250) return 'fair'
  return 'poor'
}

/**
 * Parse an RTCStatsReport into a CallQuality snapshot.
 *
 * We look for:
 *   - inbound-rtp (audio)         → bitrate, packetsLost, jitter
 *   - candidate-pair (succeeded)  → currentRoundTripTime
 *
 * Returns `null` if no inbound-rtp audio entry has been seen yet
 * (e.g. the call is connecting but no media has flowed).
 */
async function readStats(
  pc: RTCPeerConnection,
  prevBytesReceived: number,
  prevPacketsLost: number,
  prevPacketsReceived: number,
): Promise<{
  quality: CallQuality | null
  nextBytes: number
  nextLost: number
  nextRecv: number
}> {
  const report = await pc.getStats(null)

  let bytesReceived = prevBytesReceived
  let packetsLost = prevPacketsLost
  let packetsReceived = prevPacketsReceived
  let rttMs = 0
  let foundInbound = false

  report.forEach((stat) => {
    if (stat.type === 'inbound-rtp' && (stat as RTCInboundRtpStreamStats).kind === 'audio') {
      const s = stat as RTCInboundRtpStreamStats & {
        bytesReceived?: number
        packetsLost?: number
        packetsReceived?: number
      }
      bytesReceived = s.bytesReceived ?? prevBytesReceived
      packetsLost = s.packetsLost ?? prevPacketsLost
      packetsReceived = s.packetsReceived ?? prevPacketsReceived
      foundInbound = true
    } else if (stat.type === 'candidate-pair') {
      const s = stat as RTCIceCandidatePairStats
      if (s.state === 'succeeded' && typeof s.currentRoundTripTime === 'number') {
        // currentRoundTripTime is in seconds (per spec).
        rttMs = s.currentRoundTripTime * 1000
      }
    }
  })

  if (!foundInbound) {
    return {
      quality: null,
      nextBytes: prevBytesReceived,
      nextLost: prevPacketsLost,
      nextRecv: prevPacketsReceived,
    }
  }

  const bytesDelta = Math.max(0, bytesReceived - prevBytesReceived)
  const lostDelta = Math.max(0, packetsLost - prevPacketsLost)
  const recvDelta = Math.max(0, packetsReceived - prevPacketsReceived)
  // bitrate = (bytes * 8 bits/byte) / window_seconds
  const bitrateKbps = bytesDelta > 0 ? (bytesDelta * 8) / (POLL_INTERVAL_MS / 1000) / 1000 : 0
  const totalDelta = lostDelta + recvDelta
  const packetLossPct = totalDelta > 0 ? (lostDelta / totalDelta) * 100 : 0
  const level = classifyQuality(bitrateKbps, packetLossPct, rttMs)

  return {
    quality: { level, bitrateKbps, rttMs, packetLossPct },
    nextBytes: bytesReceived,
    nextLost: packetsLost,
    nextRecv: packetsReceived,
  }
}

/**
 * Start polling `pc.getStats()` while `peerConnection` is non-null.
 * Calls `onQuality(snapshot)` after every successful read. Cleans up
 * the interval when the PC is torn down or the component unmounts.
 *
 * Safe to call with `peerConnection === null` — the hook simply
 * becomes a no-op until a PC is provided.
 */
export function useCallQuality(
  peerConnection: RTCPeerConnection | null,
  onQuality: (q: CallQuality) => void,
): void {
  // Stash the latest callback in a ref so we can re-evaluate the
  // interval when only the callback identity changes (parent
  // re-renders are noisy in the chat page).
  const onQualityRef = useRef(onQuality)
  useEffect(() => {
    onQualityRef.current = onQuality
  }, [onQuality])

  useEffect(() => {
    if (!peerConnection) return
    const pc = peerConnection

    let bytes = 0
    let lost = 0
    let recv = 0
    let cancelled = false

    const tick = async () => {
      try {
        const result = await readStats(pc, bytes, lost, recv)
        bytes = result.nextBytes
        lost = result.nextLost
        recv = result.nextRecv
        if (!cancelled && result.quality) {
          onQualityRef.current(result.quality)
        }
      } catch {
        // getStats() can throw transient errors when the PC is
        // mid-renegotiation. Swallow and try again next tick.
      }
    }

    // Fire once immediately so the UI shows a value within ~100ms
    // of connection, then continue every 2s.
    void tick()
    const handle = setInterval(() => void tick(), POLL_INTERVAL_MS)

    return () => {
      cancelled = true
      clearInterval(handle)
    }
  }, [peerConnection])
}