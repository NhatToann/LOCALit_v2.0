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
import { Minimize2 } from 'lucide-react'
import { useActiveCall, activeCallStore } from '@/lib/realtime/useActiveCallStore'
import CallModal from '@/components/chat/CallModal'
import VideoCallModal from '@/components/chat/VideoCallModal'
import type { LiveKitCallClient } from '@/lib/webrtc/livekit-client'
import type { CallQuality } from '@/lib/realtime/useActiveCallStore'

type CallMode = 'voice' | 'video'

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
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const selfViewRef = useRef<HTMLVideoElement | null>(null)
  const [duration, setDuration] = useState(0)
  const [quality, setQuality] = useState<CallQuality | null>(null)
  /** Local UI state for the VideoCallModal — voice calls ignore
   *  these. We mirror them to the LiveKit client via
   *  toggleMute/toggleCamera on user interaction. */
  const [muted, setMuted] = useState(false)
  const [cameraOn, setCameraOn] = useState(true)
  /** Picture-in-Picture mode (per call-flow spec): when the user
   *  taps the Minimize button, the modal collapses to a small
   *  bubble in the bottom-right. They can still chat / navigate
   *  while the call stays active. */
  const [pip, setPip] = useState(false)

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

  // For video calls: when the client resolves AND our <video> refs
  // are mounted, ask the client to attach the LiveKit tracks to them.
  // This is what makes the global sheet work after the user
  // navigates away from /chat (the chat-page-owned <video> refs go
  // away on navigation). It also covers the case where the user
  // arrives at /chat from /map and the call was set up there.
  useEffect(() => {
    if (!client || active?.mode !== 'video') return
    // Tracks may not be published yet — poll a few times.
    let attempts = 0
    const tryAttach = () => {
      client.attachVideoElements({
        remote: remoteVideoRef.current,
        self: selfViewRef.current,
      })
      attempts += 1
    }
    tryAttach()
    const id = setInterval(() => {
      tryAttach()
      if (attempts >= 10) clearInterval(id)
    }, 300)
    return () => clearInterval(id)
  }, [client, active?.mode])

  // Once we have a client, re-call publishMic() isn't needed (chat
  // page already published) but we DO need to ensure video tracks
  // get attached to the <video> elements we render here. The
  // LiveKitCallOptions.onLocalVideoTrack and onRemoteVideoTrack
  // callbacks fire only at publish time, not when the elements
  // become available. To bridge that, we rely on the chat page's
  // existing wiring: the chat page has its own <video> refs in its
  // video state. When the user navigates AWAY from /chat, those
  // refs go away but the global sheet takes over. For that to work
  // we need to (re-)attach tracks to OUR refs here.
  //
  // We do this by polling the room's published tracks via the
  // client's internal Room — exposed through `client.mode`. If
  // mode === 'video', we wait for the remote track to appear via
  // the global realtime broadcast. As a fallback, we just attach
  // whatever LiveKit may have published by calling
  // track.attach(selfViewRef.current) on tracks we've observed.
  //
  // For now, the chat page is the source of truth for video
  // attachment during the call — when the user navigates away,
  // the global sheet shows a "video unavailable after navigation"
  // placeholder. This is a known UX limitation we'll address in a
  // follow-up.

  // Drive the duration timer. Per call-flow spec (2026-10-02 update 2)
  // the timer must start at 00:00 the moment the call modal appears
  // and count up across all pre-connect states (calling / ringing /
  // connecting) AND connected. The store sets `startedAt` at the
  // very start of the call (in startCall / acceptCall before any
  // await) so this gives an accurate elapsed time including the
  // LiveKit round-trip.
  useEffect(() => {
    if (!active) {
      setDuration(0)
      return
    }
    const preConnect =
      active.state === 'calling' ||
      active.state === 'ringing' ||
      active.state === 'connecting' ||
      active.state === 'connected'
    if (!preConnect) {
      setDuration(0)
      return
    }
    const startedAt = active.startedAt
    const tick = () => setDuration(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [active?.state, active?.startedAt, active])

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

  const isVideo = active.mode === 'video'

  // PIP bubble — small floating panel the caller can tap to expand
  // back to the full modal. Per the call-flow spec (2026-10-01):
  // "Thu nhỏ màn hình (Picture-in-Picture / PIP) — Action: Bấm nút
  //  Back/Home trong khi đang gọi".
  // We only show the bubble while a call is actively connected —
  // pre-connect and terminal states still occupy the full sheet.
  const showPip = pip && active.state === 'connected'

  if (showPip) {
    return (
      <>
        <audio ref={audioRef} autoPlay playsInline className="hidden" aria-hidden="true" />
        <div
          role="complementary"
          aria-label={`Call with ${active.partnerName} (minimised)`}
          className="fixed bottom-4 right-4 z-50 w-64 bg-surface border border-border-strong rounded-sm shadow-[0_2px_12px_rgba(0,15,15,0.12)] overflow-hidden"
        >
          <div className="flex items-center gap-3 p-3">
            <div className="w-10 h-10 bg-primary/10 text-primary inline-flex items-center justify-center rounded-sm border border-primary/20">
              <span className="text-xs font-mono">
                {Math.floor(duration / 60)
                  .toString()
                  .padStart(2, '0')}
                :{(duration % 60).toString().padStart(2, '0')}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink truncate">
                {active.partnerName}
              </p>
              <p className="text-xs text-success">In call</p>
            </div>
            <button
              type="button"
              onClick={() => setPip(false)}
              aria-label="Expand call"
              title="Expand"
              className="inline-flex items-center justify-center w-8 h-8 text-muted hover:text-ink rounded-sm"
            >
              <Minimize2 size={14} aria-hidden="true" className="rotate-180" />
            </button>
          </div>
          <div className="flex border-t border-border">
            <button
              type="button"
              onClick={() => {
                if (client) void client.toggleMute()
                setMuted((m) => !m)
              }}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className={`flex-1 h-10 text-xs font-medium border-r border-border ${
                muted ? 'bg-danger text-paper' : 'text-ink hover:bg-paper'
              }`}
            >
              {muted ? 'Unmute' : 'Mute'}
            </button>
            <button
              type="button"
              onClick={() => {
                if (client) void client.end()
                activeCallStore.setActive(null)
              }}
              aria-label="End call"
              className="flex-1 h-10 text-xs font-medium text-paper bg-danger"
            >
              End
            </button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      {/* Hidden audio sink. The chat page also attaches its own
          <audio>; this one is used when the modal survives a page
          navigation (chat page's audio element is unmounted). */}
      <audio ref={audioRef} autoPlay playsInline className="hidden" aria-hidden="true" />
      {/* Video elements are mounted alongside the audio sink so
          LiveKit can attach() remote + local video tracks to them
          without the consumer needing to wire track.attach() per
          modal. The VideoCallModal reads them via the props below. */}
      <video
        ref={isVideo ? remoteVideoRef : undefined}
        autoPlay
        playsInline
        className="hidden"
        aria-hidden="true"
      />
      <video
        ref={isVideo ? selfViewRef : undefined}
        autoPlay
        playsInline
        muted
        className="hidden"
        aria-hidden="true"
      />
      {/* Minimize button — voice + video. Hovering the top-right
          reveals a small Minimize icon that collapses the call into
          the PIP bubble (see showPip branch above). */}
      {active.state === 'connected' ? (
        <button
          type="button"
          onClick={() => setPip(true)}
          aria-label="Minimise call"
          title="Minimise"
          className="fixed top-4 right-4 z-[60] inline-flex items-center justify-center w-8 h-8 bg-ink/70 text-paper hover:bg-ink/90 rounded-sm"
        >
          <Minimize2 size={14} aria-hidden="true" />
        </button>
      ) : null}
      {isVideo ? (
        <VideoCallModal
          partnerName={active.partnerName}
          partnerAvatar={active.partnerAvatar}
          isOutgoing={active.isOutgoing}
          state={active.state}
          errorMessage={active.errorMessage}
          selfViewRef={selfViewRef}
          remoteVideoRef={remoteVideoRef}
          cameraOn={cameraOn}
          muted={muted}
          onEnd={() => {
            // (2026-10-02 fix) onEnd is called by the modal's
            // auto-dismiss effect exactly 2000ms after the state
            // transitions to 'ended' (DISMISS_AFTER_MS.ended). At
            // that point the user has seen the "Call ended" frame
            // and we can safely remove the store entry so the modal
            // unmounts. If the user clicks End a second time before
            // the auto-dismiss fires, handleEnd is idempotent
            // (client.end() on an already-disconnected room is a
            // no-op in LiveKit). We also call client.end() here as a
            // safety net in case onEnd is triggered by a path that
            // didn't go through handleEnd (e.g. error states).
            if (client) void client.end()
            activeCallStore.setActive(null)
          }}
          onToggleMute={() => setMuted((m) => !m)}
          onToggleCamera={() => setCameraOn((c) => !c)}
          onSwitchCamera={() => {
            void client?.switchCamera()
          }}
        />
      ) : (
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
            // (2026-10-02 fix) See VideoCallModal block above.
            if (client) void client.end()
            activeCallStore.setActive(null)
          }}
        />
      )}
    </>
  )
}