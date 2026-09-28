'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff } from 'lucide-react'
import type { CallClient, CallMode, CallState } from '@/lib/webrtc/call-client'
import { Avatar } from '@/components/ui/Avatar'

interface Props {
  client: CallClient | null
  mode: CallMode
  partnerName: string
  partnerAvatar: string | null
  isOutgoing: boolean
  state: CallState
  onEnd: () => void
}

const STATE_LABEL: Record<CallState, string> = {
  idle: 'Idle',
  calling: 'Calling…',
  ringing: 'Incoming call…',
  connecting: 'Connecting…',
  connected: 'In call',
  ended: 'Call ended',
  failed: 'Call failed',
  declined: 'Call declined',
  missed: 'Call missed',
}

export default function CallModal({
  client,
  partnerName,
  partnerAvatar,
  isOutgoing,
  state,
  onEnd,
}: Props) {
  const [muted, setMuted] = useState(false)
  const [duration, setDuration] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Duration counter
  useEffect(() => {
    if (state === 'connected') {
      tickRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } else {
      if (tickRef.current) clearInterval(tickRef.current)
      tickRef.current = null
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state])

  // Auto-close a moment after a terminal state
  useEffect(() => {
    if (state === 'ended' || state === 'declined' || state === 'missed' || state === 'failed') {
      const id = setTimeout(onEnd, 1800)
      return () => clearTimeout(id)
    }
    return undefined
  }, [state, onEnd])

  function handleEnd() {
    if (client) void client.end()
    onEnd()
  }

  function toggleMute() {
    if (!client) return
    const isMuted = client.toggleMute()
    setMuted(isMuted)
  }

  if (!client && state === 'idle') return null

  return (
    <div
      className="fixed inset-0 z-50 bg-ink/80 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={`Voice call with ${partnerName}`}
    >
      <div className="bg-surface rounded-sm w-full max-w-md overflow-hidden border border-border-strong">
        <div className="p-8 flex flex-col items-center text-center bg-surface">
          <p className="text-eyebrow text-primary mb-3">
            {isOutgoing ? 'Outgoing' : 'Incoming'} voice call
          </p>
          <Avatar name={partnerName} src={partnerAvatar} size="xl" />
          <h2 className="mt-4 text-lg font-semibold">{partnerName}</h2>
          <p className="text-sm text-muted mt-1" aria-live="polite">
            {state === 'connected'
              ? `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`
              : STATE_LABEL[state]}
          </p>

          <ul className="mt-6 text-xs text-muted space-y-1 text-left">
            <li>• Allow microphone access when prompted</li>
            <li>• Use headphones to avoid echo</li>
            <li>• Call log will appear in this conversation when the call ends</li>
          </ul>
        </div>

        <div className="p-6 border-t border-border flex items-center justify-center gap-3 flex-wrap bg-surface">
          {!isOutgoing && state === 'ringing' ? (
            <>
              <button
                type="button"
                onClick={() => client?.accept()}
                aria-label="Accept call"
                className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-success text-paper border border-success hover:opacity-90"
              >
                <Phone size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => client?.decline()}
                aria-label="Decline call"
                className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-danger text-paper border border-danger hover:opacity-90"
              >
                <PhoneOff size={18} aria-hidden="true" />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={toggleMute}
                aria-label={muted ? 'Unmute microphone' : 'Mute microphone'}
                className={`inline-flex items-center justify-center w-11 h-11 rounded-sm border ${
                  muted
                    ? 'bg-danger text-paper border-danger'
                    : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                }`}
              >
                {muted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
              </button>
              <button
                type="button"
                onClick={handleEnd}
                aria-label="End call"
                className="inline-flex items-center justify-center w-12 h-12 rounded-sm bg-danger text-paper border border-danger hover:opacity-90"
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
