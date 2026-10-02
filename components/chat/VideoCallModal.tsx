/**
 * VideoCallModal — WhatsApp/Viber-style video-call sheet.
 *
 * Renders two video tiles:
 *   - Remote participant's video (large, fills the modal)
 *   - Local self-view (small, draggable, bottom-right)
 *
 * Pre-connect states (calling / ringing / connecting) show the
 * remote avatar instead of a video tile — we can't render their
 * stream until they've joined.
 *
 * Layout rules (per `web-ai-slop` Section 4 — keep it flat):
 *   - Border-radius 4px (Tailwind `rounded-sm`) — no pills
 *   - No box-shadow on tiles — `border-border-strong` outline only
 *   - No gradients on the control bar — `bg-ink/95` backdrop only
 *
 * Self-view mirroring:
 *   The local <video> is flipped with `transform: scaleX(-1)` so it
 *   reads like a mirror — the user sees their own face left-right
 *   correct. Remote video is NOT mirrored (we want to see them as
 *   they see themselves, which is mirrored for them on their own
 *   device).
 */

'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Video,
  VideoOff,
  Camera,
  SwitchCamera,
  Loader2,
  X,
  PhoneMissed,
  WifiOff,
} from 'lucide-react'
import type {
  LiveKitCallClient,
} from '@/lib/webrtc/livekit-client'
import {
  chimeAccept,
  chimeDecline,
  chimeEnd,
  chimeToggle,
} from '@/lib/webrtc/call-effects'
import { Avatar } from '@/components/ui/Avatar'

type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'declined'
  | 'missed'
  | 'ended'
  | 'failed'

interface Props {
  client?: LiveKitCallClient | null
  partnerName: string
  partnerAvatar: string | null
  isOutgoing: boolean
  state: CallState
  errorMessage?: string | null
  /** Self-view <video> element ref — the modal owns the element, the
   *  consumer wires the track to it via `attachSelfViewTrack`. */
  selfViewRef?: React.RefObject<HTMLVideoElement | null>
  /** Remote <video> element ref — same idea. */
  remoteVideoRef?: React.RefObject<HTMLVideoElement | null>
  /**
   * Whether the local camera is currently enabled. The hook in
   * livekit-client.ts tracks this; we render the icon accordingly.
   */
  cameraOn?: boolean
  muted?: boolean
  onEnd: () => void
  onToggleMute?: () => void
  onToggleCamera?: () => void
  onSwitchCamera?: () => void
}

const DISMISS_AFTER_MS: Partial<Record<CallState, number>> = {
  ended: 2000,
  declined: 2500,
  missed: 3000,
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/**
 * The headline shown below the avatar.
 *
 * Per call-flow spec (2026-10-02 update 05): the duration timer 00:00
 * starts ONLY when both sides have joined the LiveKit room and media
 * is flowing (state === 'connected'). Before that:
 *   - caller sees "Calling X…" while waiting for the receiver to accept
 *   - receiver sees "Incoming video call" while the Accept popup is up
 *   - both sides see "Connecting…" during the LiveKit handshake
 * The timer is rendered as its own DOM element below the headline, so
 * the pre-connect text and the timer never share a slot.
 */
function headlineFor(
  state: CallState,
  isOutgoing: boolean,
  partnerFirstName: string,
): { text: string; tone: 'default' | 'success' | 'danger' } {
  switch (state) {
    case 'calling':
      return { text: `Calling ${partnerFirstName}…`, tone: 'default' }
    case 'ringing':
      return isOutgoing
        ? { text: `Calling ${partnerFirstName}…`, tone: 'default' }
        : { text: 'Incoming video call', tone: 'success' }
    case 'connecting':
      return { text: 'Connecting…', tone: 'default' }
    case 'connected':
      return { text: '', tone: 'default' }
    case 'declined':
      return { text: 'Call declined', tone: 'danger' }
    case 'missed':
      return { text: 'No answer', tone: 'danger' }
    case 'ended':
      return { text: `Call ended`, tone: 'default' }
    case 'failed':
      return { text: 'Call failed', tone: 'danger' }
    default:
      return { text: '', tone: 'default' }
  }
}

export default function VideoCallModal({
  client,
  partnerName,
  partnerAvatar,
  isOutgoing,
  state,
  errorMessage,
  selfViewRef,
  remoteVideoRef,
  cameraOn = true,
  muted = false,
  onEnd,
  onToggleMute,
  onToggleCamera,
  onSwitchCamera,
}: Props) {
  const [duration, setDuration] = useState(0)
  const [closeHovered, setCloseHovered] = useState(false)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track navigator.onLine + visibilitychange so we can paint the
  // Reconnecting… overlay per the spec. LiveKit also has its own
  // reconnect state — for the modal we just reflect the browser's
  // view of the world (the WebRTC layer will surface its own error
  // through the client's `onState` callback if LiveKit gives up).
  const [networkStatus, setNetworkStatus] = useState<
    'online' | 'reconnecting' | 'offline'
  >(
    typeof navigator !== 'undefined' && !navigator.onLine
      ? 'offline'
      : 'online',
  )
  useEffect(() => {
    if (typeof window === 'undefined') return
    const handleOffline = () => setNetworkStatus('offline')
    const handleOnline = () => setNetworkStatus('online')
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        // We treat coming back from hidden as a reconnect attempt;
        // the network banner flips to 'reconnecting' for 800ms then
        // back to 'online' if navigator.onLine is true.
        setNetworkStatus('reconnecting')
        setTimeout(() => {
          setNetworkStatus(
            typeof navigator !== 'undefined' && !navigator.onLine
              ? 'offline'
              : 'online',
          )
        }, 800)
      }
    }
    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)
    return () => {
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const isPreConnect =
    state === 'calling' || state === 'ringing' || state === 'connecting'
  const isIncomingRinging = !isOutgoing && state === 'ringing'
  const isTerminal =
    state === 'ended' || state === 'declined' || state === 'missed' || state === 'failed'

  // Duration timer — per call-flow spec (2026-10-02 update 03): the
  // timer starts ONLY when state === 'connected' (both peers in the
  // LiveKit room, media flowing). Before that the modal shows the
  // pre-connect headline instead. Once the call ends we freeze the
  // duration so "Call ended · MM:SS" reads correctly.
  useEffect(() => {
    if (state === 'connected') {
      tickRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } else {
      if (tickRef.current) clearInterval(tickRef.current)
      tickRef.current = null
      // Reset duration only when the modal is going idle (call fully
      // removed from the store). On terminal states ('ended',
      // 'declined', 'missed', 'failed') we keep the last value so the
      // "Call ended · MM:SS" readout still shows the elapsed time.
      if (state === 'idle') setDuration(0)
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state])

  // Auto-dismiss
  useEffect(() => {
    const delay = DISMISS_AFTER_MS[state]
    if (!delay || closeHovered) return
    dismissTimerRef.current = setTimeout(onEnd, delay)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [state, onEnd, closeHovered])

  const handleEnd = useCallback(() => {
    chimeEnd()
    void client?.end()
    onEnd()
  }, [client, onEnd])

  const handleAccept = useCallback(() => {
    chimeAccept()
    onEnd()
  }, [onEnd])

  const handleDecline = useCallback(() => {
    chimeDecline()
    void client?.decline()
  }, [client])

  const partnerFirstName = partnerName.split(' ')[0] || partnerName
  const { text: headlineText, tone: headlineTone } = headlineFor(
    state,
    isOutgoing,
    partnerFirstName,
  )
  const headlineClass =
    headlineTone === 'danger'
      ? 'text-sm text-danger font-medium mt-1'
      : headlineTone === 'success'
        ? 'text-sm text-success font-medium mt-1'
        : 'text-sm text-muted mt-1 font-mono'

  if (!client && state === 'idle') return null

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/95 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Video call with ${partnerName}`}
    >
      <div className="relative w-full max-w-4xl aspect-video bg-surface overflow-hidden border border-border-strong rounded-sm">
        {/* Header */}
        <div className="absolute top-0 inset-x-0 z-20 flex items-center justify-between px-4 py-3 bg-gradient-to-b from-ink/80 to-transparent">
          <p className="text-eyebrow text-paper">
            {isOutgoing ? 'Outgoing' : 'Incoming'} video call
          </p>
          <button
            type="button"
            onClick={() => onEnd()}
            aria-label="Close call dialog"
            className="inline-flex items-center justify-center w-7 h-7 text-paper hover:text-ink rounded-sm"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Remote video — fills the modal */}
        <div className="absolute inset-0 flex items-center justify-center bg-ink">
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            // Remote video is NOT mirrored — we want to see them as
            // they see themselves (which they see mirrored locally).
            className="w-full h-full object-cover"
            aria-label={`Remote video from ${partnerName}`}
          />
          {/* Pre-connect / no-remote fallback: avatar + status */}
          {isPreConnect || state === 'failed' ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/80">
              <div className="relative animate-call-pulse">
                <Avatar name={partnerName} src={partnerAvatar} size="xl" />
                {isPreConnect ? (
                  <>
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-sm border-2 border-primary animate-call-pulse-ring pointer-events-none"
                    />
                    <span
                      aria-hidden="true"
                      className="absolute inset-0 rounded-sm border-2 border-primary animate-call-pulse-ring pointer-events-none"
                      style={{ animationDelay: '0.6s' }}
                    />
                  </>
                ) : null}
              </div>
              <h2 className="mt-4 text-xl font-semibold text-paper">
                {partnerName}
              </h2>
              {/* Pre-connect: show "Calling X…" / "Connecting…" /
                  "Incoming video call" depending on direction. The
                  duration timer is NOT shown here — that lives in
                  its own DOM element below the avatar when state
                  becomes 'connected'. */}
              <p className={headlineClass} aria-live="polite">
                {headlineText}
              </p>
              {state === 'failed' && errorMessage ? (
                <p
                  className="mt-2 text-xs text-danger max-w-xs break-words"
                  role="alert"
                >
                  {errorMessage}
                </p>
              ) : null}
            </div>
          ) : null}

          {/* Terminal-state overlay on top of remote video */}
          {isTerminal ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-ink/70">
              <div className="relative opacity-70">
                <Avatar name={partnerName} src={partnerAvatar} size="xl" />
                {state === 'missed' ? (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-7 h-7 bg-danger text-paper rounded-sm border border-surface"
                  >
                    <PhoneMissed size={14} />
                  </span>
                ) : null}
                {(state === 'failed' || state === 'declined') ? (
                  <span
                    aria-hidden="true"
                    className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-7 h-7 bg-danger text-paper rounded-sm border border-surface"
                  >
                    <PhoneOff size={14} />
                  </span>
                ) : null}
              </div>
              <h2 className="mt-4 text-xl font-semibold text-paper">
                {partnerName}
              </h2>
              {/* Terminal-state headline. 'ended' shows the duration
                  alongside the 'Call ended' label (e.g. 'Call ended
                  · 01:23'); missed / declined / failed show the
                  outcome text only. */}
              <p className={headlineClass} aria-live="polite">
                {state === 'ended'
                  ? `Call ended · ${fmtDuration(duration)}`
                  : headlineText}
              </p>
            </div>
          ) : null}
        </div>

        {/* Self-view (PIP) — bottom-right, mirrored */}
        {state === 'connected' || state === 'connecting' ? (
          <div className="absolute bottom-20 right-4 z-20 w-40 h-28 bg-ink border border-border-strong rounded-sm overflow-hidden shadow-lg">
            <video
              ref={selfViewRef}
              autoPlay
              playsInline
              muted
              // Mirror so the user sees themselves left-right correct.
              className="w-full h-full object-cover"
              style={{ transform: 'scaleX(-1)' }}
              aria-label="Self-view"
            />
            {!cameraOn ? (
              <div className="absolute inset-0 flex items-center justify-center bg-ink/90">
                <VideoOff size={20} className="text-paper" aria-hidden="true" />
              </div>
            ) : null}
            <span className="absolute bottom-1 left-1 text-[10px] font-mono text-paper bg-ink/70 px-1.5 py-0.5 rounded-sm">
              You
            </span>
          </div>
        ) : null}

        {/* Network reconnecting overlay (per spec Edge-Case #2) */}
        {state === 'connected' && networkStatus !== 'online' ? (
          <div
            className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-ink/70 backdrop-blur-[1px]"
            role="status"
            aria-live="polite"
          >
            <div className="inline-flex items-center gap-2 px-4 py-3 text-sm bg-warning-bg text-warning border border-warning rounded-sm">
              {networkStatus === 'reconnecting' ? (
                <Loader2 size={16} aria-hidden="true" className="animate-spin" />
              ) : (
                <WifiOff size={16} aria-hidden="true" />
              )}
              <span className="font-medium">
                {networkStatus === 'offline'
                  ? 'You are offline. Reconnecting…'
                  : 'Connection unstable. Reconnecting…'}
              </span>
            </div>
          </div>
        ) : null}

        {/* Footer controls */}
        <div className="absolute bottom-0 inset-x-0 z-20 p-4 bg-gradient-to-t from-ink/95 to-transparent">
          <div className="flex items-center justify-center gap-3 flex-wrap">
            {isIncomingRinging ? (
              <>
                <button
                  type="button"
                  onClick={handleAccept}
                  aria-label="Accept video call"
                  className="inline-flex items-center justify-center w-16 h-16 bg-success text-paper border border-success rounded-sm hover:opacity-90"
                >
                  <Phone size={22} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  onClick={handleDecline}
                  aria-label="Decline video call"
                  className="inline-flex items-center justify-center w-16 h-16 bg-danger text-paper border border-danger rounded-sm hover:opacity-90"
                >
                  <PhoneOff size={22} aria-hidden="true" />
                </button>
              </>
            ) : isTerminal ? (
              <>
                {state === 'missed' ? (
                  <button
                    type="button"
                    onClick={() => onEnd()}
                    className="inline-flex items-center justify-center h-10 px-4 text-sm bg-primary text-paper border border-primary rounded-sm hover:bg-primary-hover"
                    aria-label="Close and call again"
                  >
                    Call again
                  </button>
                ) : null}
                <button
                  type="button"
                  onMouseEnter={() => setCloseHovered(true)}
                  onMouseLeave={() => setCloseHovered(false)}
                  onFocus={() => setCloseHovered(true)}
                  onBlur={() => setCloseHovered(false)}
                  onClick={() => onEnd()}
                  aria-label="Close"
                  className="inline-flex items-center justify-center h-10 px-4 text-sm bg-paper text-ink border border-border-strong rounded-sm hover:bg-surface"
                >
                  Close
                </button>
              </>
            ) : (
              <>
                {/* Mute */}
                <button
                  type="button"
                  onClick={() => onToggleMute?.()}
                  disabled={state !== 'connected'}
                  aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-sm border ${
                    muted
                      ? 'bg-danger text-paper border-danger'
                      : 'bg-ink/70 text-paper border-paper/30 hover:bg-ink/90'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {muted ? (
                    <MicOff size={18} aria-hidden="true" />
                  ) : (
                    <Mic size={18} aria-hidden="true" />
                  )}
                </button>

                {/* Camera on/off */}
                <button
                  type="button"
                  onClick={() => onToggleCamera?.()}
                  disabled={state !== 'connected'}
                  aria-label={cameraOn ? 'Turn camera off' : 'Turn camera on'}
                  className={`inline-flex items-center justify-center w-12 h-12 rounded-sm border ${
                    !cameraOn
                      ? 'bg-danger text-paper border-danger'
                      : 'bg-ink/70 text-paper border-paper/30 hover:bg-ink/90'
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {cameraOn ? (
                    <Video size={18} aria-hidden="true" />
                  ) : (
                    <VideoOff size={18} aria-hidden="true" />
                  )}
                </button>

                {/* Switch camera (mobile only — no-op on desktop) */}
                <button
                  type="button"
                  onClick={() => onSwitchCamera?.()}
                  disabled={state !== 'connected'}
                  aria-label="Switch camera"
                  title="Switch front/back camera"
                  className="inline-flex items-center justify-center w-12 h-12 rounded-sm border bg-ink/70 text-paper border-paper/30 hover:bg-ink/90 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <SwitchCamera size={18} aria-hidden="true" />
                </button>

                {/* End */}
                <button
                  type="button"
                  onClick={handleEnd}
                  aria-label="End call"
                  className="inline-flex items-center justify-center w-14 h-14 bg-danger text-paper border border-danger rounded-sm hover:opacity-90"
                >
                  <PhoneOff size={20} aria-hidden="true" />
                </button>
              </>
            )}
          </div>
          {/* Tips during pre-connect */}
          {isPreConnect ? (
            <ul className="mt-3 text-xs text-paper/70 space-y-0.5 text-center">
              <li>Allow microphone and camera access when prompted</li>
              <li>Use headphones to avoid echo</li>
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  )
}
