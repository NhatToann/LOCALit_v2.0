/**
 * CallModal — WhatsApp/Viber-style voice-call sheet.
 *
 * Replaces the old flat modal with:
 *   - per-state visual treatment (calling/ringing/connecting/
 *     connected/declined/missed/ended/failed)
 *   - live quality strip (bitrate + RTT) while connected
 *   - mute / speaker / end controls
 *   - Accept/Decline for incoming ringing
 *   - "Reconnecting…" banner when the browser goes offline mid-call
 *
 * Audio sink switching is best-effort: `setSinkId` only exists on
 * Chromium browsers. On Firefox/Safari the speaker button is
 * disabled with a tooltip explaining the limitation.
 */

'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Phone,
  PhoneOff,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
  SignalHigh,
  SignalMedium,
  SignalLow,
  WifiOff,
  Loader2,
  X,
  PhoneMissed,
  Video,
} from 'lucide-react'
import type {
  LiveKitCallClient,
} from '@/lib/webrtc/livekit-client'
import { chimeAccept, chimeDecline, chimeEnd, chimeToggle } from '@/lib/webrtc/call-effects'
import { CallActionFooter } from '@/components/chat/CallActionFooter'
// CallMode / CallState / CallQuality / NetworkStatus used to live in
// @/lib/webrtc/webrtc-client. They're now defined locally here.
type CallMode = 'voice' | 'video'
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
type CallQuality = {
  level: 'excellent' | 'good' | 'fair' | 'poor'
  bitrateKbps: number
  rttMs: number
  packetLossPct: number
}
type NetworkStatus = 'online' | 'reconnecting' | 'offline'
import { Avatar } from '@/components/ui/Avatar'

interface Props {
  client: LiveKitCallClient | null
  mode: CallMode
  partnerName: string
  partnerAvatar: string | null
  isOutgoing: boolean
  state: CallState
  /** Optional detailed error message (e.g. "Could not accept call: ...")
   *  shown below the headline when state === 'failed'. */
  errorMessage?: string | null
  /**
   * Optional audio element that holds the remote MediaStream. The
   * speaker toggle routes `setSinkId(...)` through this element. If
   * omitted the speaker button is disabled.
   */
  audioRef?: React.RefObject<HTMLAudioElement | null>
  /**
   * Quality snapshot computed externally (e.g. by ActiveCallSheet
   * which doesn't have direct access to `useCallQuality` for the
   * chat-page-owned CallClient). When omitted, the modal computes its
   * own quality via `useCallQuality(client.peerConnection)`.
   */
  qualityOverride?: CallQuality | null
  /** Duration in seconds, externally computed. */
  durationOverride?: number
  onEnd: () => void
  onQuality?: (q: CallQuality) => void
  /**
   * Optional handler invoked when the user taps the in-call "switch
   * to video" button. When omitted, the button is hidden. Per the
   * call-flow spec (2026-10-01): "Nút Mắt camera (Chuyển nhanh sang
   * video — nếu đang gọi thoại)".
   */
  onUpgradeToVideo?: () => void
}

// Per-state auto-dismiss timeout (ms). Per call-flow spec (2026-10-02):
//   - ended: 2000ms (was 1500ms). The user wants the "Call ended" frame
//     to stay visible long enough to read; 2s is the round number they
//     asked for. They can also click disconnect a second time to dismiss
//     immediately.
//   - declined: 2500ms (unchanged)
//   - missed: 3000ms (unchanged)
//   - failed: no auto-dismiss — the errorMessage must be readable, the
//     user dismisses by clicking Close.
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
 * The headline shown below the avatar. Returns the small text and an
 * optional icon hint for terminal states (declined/missed/failed).
 */
function headlineFor(
  state: CallState,
  isOutgoing: boolean,
  partnerFirstName: string,
  duration: number,
): { text: string; tone: 'default' | 'success' | 'danger' } {
  switch (state) {
    case 'calling':
      // Outgoing — pre-LiveKit. Headline says "Calling X…" and a small
      // "Connecting to server…" hint sits below the avatar.
      return { text: `Calling ${partnerFirstName}…`, tone: 'default' }
    case 'ringing':
      // Per call-flow spec (2026-10-02): both sides see "Ringing…" once
      // signaling has reached the peer and we're waiting for them to
      // accept. The receiver also sees this after clicking Accept but
      // before LiveKit's WebRTC session is established.
      return { text: 'Ringing…', tone: 'default' }
    case 'connecting':
      // Per call-flow spec (2026-10-02): the explicit "Connecting to
      // server…" label belongs here. This is the pre-LiveKit state
      // (modal just appeared, no network round-trip done yet) and the
      // brief window between room.connect() and TrackSubscribed where
      // LiveKit is still handshaking.
      return {
          text: 'Connecting to server…',
          tone: 'default',
        }
    case 'connected':
      return { text: fmtDuration(duration), tone: 'default' }
    case 'declined':
      return { text: 'Call declined', tone: 'danger' }
    case 'missed':
      return { text: 'No answer', tone: 'danger' }
    case 'ended':
      return { text: 'Call ended', tone: 'default' }
    case 'failed':
      return { text: 'Call failed', tone: 'danger' }
    default:
      return { text: '', tone: 'default' }
  }
}

/**
 * State-driven body class for the avatar wrapper. Drives the pulse
 * ring (calling/ringing/connecting) and the dim (terminal states).
 */
function avatarWrapperClass(state: CallState): string {
  if (state === 'calling' || state === 'ringing' || state === 'connecting') {
    return 'relative animate-call-pulse'
  }
  if (state === 'declined' || state === 'missed' || state === 'failed' || state === 'ended') {
    return 'relative opacity-70'
  }
  return 'relative'
}

export default function CallModal({
  client,
  mode,
  partnerName,
  partnerAvatar,
  isOutgoing,
  state,
  errorMessage,
  audioRef,
  qualityOverride,
  durationOverride,
  onEnd,
  onQuality,
  onUpgradeToVideo,
}: Props) {
  const [muted, setMuted] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [duration, setDuration] = useState(0)
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus>(
    typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'online',
  )
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Track mouse-hover over the dismiss button so the auto-dismiss
  // timer doesn't fire while the user is reaching for it.
  const [closeHovered, setCloseHovered] = useState(false)

  // Quality is now provided externally via `qualityOverride` (computed
  // in ActiveCallSheet from getStats). LiveKit doesn't expose the raw
  // RTCPeerConnection on its public API, so the legacy
  // `useCallQuality(client.peerConnection)` path is gone.
  const effectiveQuality = qualityOverride ?? null

  // Duration timer while connected — either external (ActiveCallSheet
  // computes from the startedAt timestamp) or local (increments each
  // second once connected).
  useEffect(() => {
    if (durationOverride !== undefined) {
      setDuration(durationOverride)
      return
    }
    if (state === 'connected') {
      tickRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } else {
      if (tickRef.current) clearInterval(tickRef.current)
      tickRef.current = null
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state, durationOverride])

  // Auto-dismiss after a terminal state. Skipped while the user is
  // hovering the Close button so they have time to click.
  //
  // (2026-10-02 update): the parent (ActiveCallSheet) is now
  // responsible for removing the active call from the store 2.1s
  // after the End click. This effect still fires onEnd() at the
  // auto-dismiss boundary, but onEnd is idempotent in the new flow
  // (it just calls client.end() which is a no-op once the LiveKit
  // session is already torn down). The double-call is harmless.
  useEffect(() => {
    const delay = DISMISS_AFTER_MS[state]
    if (!delay) return
    if (closeHovered) return
    dismissTimerRef.current = setTimeout(onEnd, delay)
    return () => {
      if (dismissTimerRef.current) clearTimeout(dismissTimerRef.current)
    }
  }, [state, onEnd, closeHovered])

  function handleEnd() {
    // (2026-10-02 fix) Don't call onEnd here. The auto-dismiss
    // effect schedules onEnd after DISMISS_AFTER_MS[ended]=2000ms,
    // and ActiveCallSheet also schedules a setTimeout(2100ms) to
    // clear the store. Calling onEnd twice would just re-fire
    // client.end() (idempotent). The state transition to 'ended' is
    // driven by LiveKit's onState callback which the chat page
    // forwards to activeCallStore.patchActive — the modal re-renders
    // with state='ended' and shows the "Call ended" headline.
    chimeEnd()
    if (client) void client.end()
  }

  function handleAccept() {
    // LiveKit connects on room.join — the accept flow already
    // happens upstream in acceptCall(). The modal here just needs to
    // dismiss the "ringing" state.
    chimeAccept()
    onEnd()
  }

  function handleDecline() {
    chimeDecline()
    void client?.decline()
  }

  function toggleMute() {
    if (!client) return
    const next = client.toggleMute()
    setMuted(next)
    chimeToggle()
  }

  /**
   * Switch the audio output sink. Best-effort: only Chromium-based
   * browsers implement `setSinkId`. We treat `''` as "default
   * device" — Chrome interprets that as routing back to the system
   * default. Real device enumeration is hidden by most browsers for
   * privacy, so the visible UI is just a binary toggle (default /
   * alternate) rather than a device picker.
   */
  async function toggleSpeaker() {
    const audio = audioRef?.current
    if (!audio) return
    const supportsSinkId =
      typeof (audio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> })
        .setSinkId === 'function'
    if (!supportsSinkId) return
    try {
      const sinkAudio = audio as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }
      await sinkAudio.setSinkId(speakerOn ? '' : 'default')
      setSpeakerOn((v) => !v)
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[call] setSinkId failed:', err)
    }
  }

  // Pre-compute the derived flags so JSX stays flat.
  const isIncomingRinging = !isOutgoing && state === 'ringing'
  const isPreConnect =
    state === 'calling' || state === 'ringing' || state === 'connecting'
  const isTerminal =
    state === 'ended' || state === 'declined' || state === 'missed' || state === 'failed'
  const supportsSpeaker = Boolean(audioRef?.current) && client != null && !isTerminal
  const partnerFirstName = partnerName.split(' ')[0] || partnerName
  const { text: headlineText, tone: headlineTone } = headlineFor(
    state,
    isOutgoing,
    partnerFirstName,
    duration,
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
      className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Voice call with ${partnerName}`}
    >
      <div className="bg-surface w-full max-w-md overflow-hidden border border-border-strong rounded-sm">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-surface">
          <p className="text-eyebrow text-primary">
            {isOutgoing ? 'Outgoing' : 'Incoming'} voice call
          </p>
          <button
            type="button"
            onClick={() => onEnd()}
            aria-label="Close call dialog"
            className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-ink rounded-sm"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {/* Body */}
        <div className="p-8 flex flex-col items-center text-center bg-surface">
          <div className={avatarWrapperClass(state)}>
            <Avatar name={partnerName} src={partnerAvatar} size="xl" />
            {/* Pulse rings layered behind avatar via absolute divs */}
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
            {/* Terminal-state badge overlay */}
            {state === 'missed' ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-7 h-7 bg-danger text-paper rounded-sm border border-surface"
              >
                <PhoneMissed size={14} />
              </span>
            ) : null}
            {state === 'failed' || state === 'declined' ? (
              <span
                aria-hidden="true"
                className="absolute -bottom-1 -right-1 inline-flex items-center justify-center w-7 h-7 bg-danger text-paper rounded-sm border border-surface"
              >
                <PhoneOff size={14} />
              </span>
            ) : null}
          </div>
          <h2 className="mt-4 text-xl font-semibold">{partnerName}</h2>
          <p className={headlineClass} aria-live="polite">
            {headlineText}
          </p>
          {/* Detailed error message — only on failed state and only if
              the parent supplied a non-empty message. */}
          {state === 'failed' && errorMessage ? (
            <p
              className="mt-2 text-xs text-danger max-w-xs break-words"
              role="alert"
            >
              {errorMessage}
            </p>
          ) : null}

          {/* Direction hint — subhead line below the main headline */}
          {!isTerminal && isOutgoing && state === 'calling' ? (
            <p className="text-xs text-subtle mt-0.5">
              Dialing {partnerFirstName}
            </p>
          ) : null}
          {!isTerminal && isOutgoing && state === 'ringing' ? (
            <p className="text-xs text-subtle mt-0.5">Waiting for {partnerFirstName} to answer</p>
          ) : null}
          {!isTerminal && !isOutgoing && state === 'ringing' ? (
            <p className="text-xs text-subtle mt-0.5">{partnerName} is calling…</p>
          ) : null}
          {!isTerminal && state === 'connecting' ? (
            <p className="text-xs text-subtle mt-0.5">Establishing connection…</p>
          ) : null}

          {/* Network status banner */}
          {state !== 'idle' && networkStatus !== 'online' ? (
            <div
              className="mt-4 w-full inline-flex items-center gap-2 px-3 py-2 text-xs bg-warning-bg text-warning border border-warning rounded-sm"
              role="status"
              aria-live="polite"
            >
              {networkStatus === 'reconnecting' ? (
                <Loader2 size={12} aria-hidden="true" className="animate-spin" />
              ) : (
                <WifiOff size={12} aria-hidden="true" />
              )}
              <span>
                {networkStatus === 'offline'
                  ? 'You are offline. Trying to reconnect…'
                  : 'Reconnecting…'}
              </span>
            </div>
          ) : null}

          {/* Quality strip — only visible once connected and we have a sample */}
          {state === 'connected' && effectiveQuality ? (
            <div
              className="mt-5 w-full flex items-center justify-center gap-2 px-3 py-2 border-t border-border bg-paper text-xs"
              aria-label="Call quality"
            >
              <QualityBadge quality={effectiveQuality} />
            </div>
          ) : null}

          {/* Tips (only during pre-connect) */}
          {isPreConnect ? (
            <ul className="mt-6 text-xs text-muted space-y-1 text-left w-full">
              <li>• Allow microphone access when prompted</li>
              <li>• Use headphones to avoid echo</li>
              <li>• Call log will appear in this conversation when the call ends</li>
            </ul>
          ) : null}
        </div>

        {/* Quality strip (alternative placement — only if no quality data yet) */}
        {state === 'connected' && !effectiveQuality ? (
          <div className="px-4 py-2 border-t border-border bg-paper text-center text-xs text-subtle">
            Connecting media…
          </div>
        ) : null}

        {/* Footer controls */}
        <div className="border-t border-border bg-surface">
          {isIncomingRinging ? (
            <CallActionFooter
              onAccept={handleAccept}
              onDecline={handleDecline}
              size="md"
            />
          ) : isTerminal ? (
            <>
              {state === 'missed' ? (
                <button
                  type="button"
                  onClick={() => {
                    onEnd()
                    // Re-trigger a fresh call by deferring to the
                    // parent — the parent owns startCall(). We just
                    // close this modal; the parent's button is still
                    // enabled if the buddy is online.
                  }}
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
              {/* Upgrade to video — only meaningful for voice-mode calls
                  and only after media is flowing. */}
              {mode === 'voice' && onUpgradeToVideo && state === 'connected' ? (
                <button
                  type="button"
                  onClick={() => onUpgradeToVideo()}
                  aria-label="Switch to video call"
                  title="Switch to video call"
                  className="inline-flex items-center justify-center w-14 h-14 rounded-sm border bg-transparent text-ink border-border-strong hover:bg-paper"
                >
                  <Video size={18} aria-hidden="true" />
                </button>
              ) : null}

              {/* Mute — only meaningful once media is flowing */}
              <button
                type="button"
                onClick={toggleMute}
                disabled={state !== 'connected'}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                title={state !== 'connected' ? 'Available once the call connects' : undefined}
                className={`inline-flex items-center justify-center w-14 h-14 rounded-sm border ${
                  muted
                    ? 'bg-danger text-paper border-danger'
                    : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {muted ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
              </button>

              {/* Speaker */}
              <button
                type="button"
                onClick={toggleSpeaker}
                disabled={!supportsSpeaker}
                aria-label={speakerOn ? 'Speaker on' : 'Speaker off'}
                title={
                  !audioRef?.current
                    ? 'Audio sink not available'
                    : !supportsSpeaker
                      ? 'Speaker control not supported on this browser'
                      : undefined
                }
                className={`inline-flex items-center justify-center w-14 h-14 rounded-sm border ${
                  speakerOn
                    ? 'bg-info-bg text-info border-info'
                    : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                } disabled:opacity-40 disabled:cursor-not-allowed`}
              >
                {speakerOn ? (
                  <VolumeX size={18} aria-hidden="true" />
                ) : (
                  <Volume2 size={18} aria-hidden="true" />
                )}
              </button>

              {/* End */}
              <button
                type="button"
                onClick={handleEnd}
                aria-label="End call"
                className="inline-flex items-center justify-center w-14 h-14 bg-danger text-paper border border-danger rounded-sm hover:opacity-90"
              >
                <PhoneOff size={18} aria-hidden="true" />
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/**
 * Compact quality badge — Lucide signal-bar icon + label + numbers.
 * Color matches the level. Bitrate and RTT use `font-mono` so the
 * numbers don't jiggle as digits change.
 */
function QualityBadge({ quality }: { quality: CallQuality }) {
  const { level, bitrateKbps, rttMs, packetLossPct } = quality
  const Icon =
    level === 'excellent' || level === 'good'
      ? SignalHigh
      : level === 'fair'
        ? SignalMedium
        : SignalLow
  const colorClass =
    level === 'excellent' || level === 'good'
      ? 'text-success'
      : level === 'fair'
        ? 'text-warning'
        : 'text-danger animate-pulse'
  const levelLabel =
    level === 'excellent'
      ? 'Excellent'
      : level === 'good'
        ? 'Good'
        : level === 'fair'
          ? 'Fair'
          : 'Poor'
  return (
    <div className={`inline-flex items-center gap-2 ${colorClass}`}>
      <Icon size={14} aria-hidden="true" />
      <span className="font-medium">{levelLabel}</span>
      <span aria-hidden="true" className="text-subtle">·</span>
      <span className="font-mono">{Math.round(bitrateKbps)} kbps</span>
      <span aria-hidden="true" className="text-subtle">·</span>
      <span className="font-mono">{Math.round(rttMs)} ms</span>
      {packetLossPct >= 5 ? (
        <>
          <span aria-hidden="true" className="text-subtle">·</span>
          <span className="font-mono">{packetLossPct.toFixed(1)}% loss</span>
        </>
      ) : null}
    </div>
  )
}