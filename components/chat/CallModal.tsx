'use client'

import { useEffect, useRef, useState } from 'react'
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff } from 'lucide-react'
import type { CallClient, CallMode } from '@/lib/webrtc/call-client'
import { createClient } from '@/utils/supabase/auth'
import { Avatar } from '@/components/ui/Avatar'

interface Props {
  client: CallClient | null
  mode: CallMode
  partnerName: string
  partnerAvatar: string | null
  isOutgoing: boolean
  state: 'idle' | 'calling' | 'ringing' | 'connecting' | 'connected' | 'ended' | 'failed' | 'declined' | 'missed'
  onEnd: () => void
}

const STATE_LABEL: Record<Props['state'], string> = {
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

export default function CallModal({ client, mode, partnerName, partnerAvatar, isOutgoing, state, onEnd }: Props) {
  const localVideoRef = useRef<HTMLVideoElement | null>(null)
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [duration, setDuration] = useState(0)
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Bind local stream to <video>
  useEffect(() => {
    if (!client) return
    client['opts'].onLocalStream = (stream) => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
    }
    client['opts'].onRemoteStream = (stream) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = stream
      }
    }
  }, [client])

  // Duration counter
  useEffect(() => {
    if (state === 'connected') {
      tickRef.current = setInterval(() => setDuration((d) => d + 1), 1000)
    } else {
      if (tickRef.current) clearInterval(tickRef.current)
      setDuration(0)
    }
    return () => {
      if (tickRef.current) clearInterval(tickRef.current)
    }
  }, [state])

  function handleEnd() {
    if (client) client.end()
    onEnd()
  }

  function toggleMute() {
    if (!client) return
    const isMuted = client.toggleMute()
    setMuted(isMuted)
  }

  function toggleCamera() {
    if (!client) return
    const off = client.toggleCamera()
    setCameraOff(off)
  }

  if (!client && state === 'idle') return null

  const showVideo = mode === 'video'

  return (
    <div className="fixed inset-0 z-50 bg-ink/80 backdrop-blur-sm flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="bg-surface rounded-sm w-full max-w-3xl overflow-hidden border border-border-strong">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {/* Remote */}
          <div className="aspect-video bg-ink relative flex items-center justify-center">
            {showVideo ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                aria-label="Remote video"
                className="w-full h-full object-cover"
              />
            ) : null}
            <div className="absolute inset-0 flex flex-col items-center justify-center text-paper">
              <Avatar name={partnerName} src={partnerAvatar} size="2xl" />
              <p className="mt-3 text-base font-semibold">{partnerName}</p>
              <p className="text-xs opacity-80 mt-1" aria-live="polite">
                {state === 'connected'
                  ? `${String(Math.floor(duration / 60)).padStart(2, '0')}:${String(duration % 60).padStart(2, '0')}`
                  : STATE_LABEL[state]}
              </p>
            </div>
            {showVideo ? (
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                aria-label="Your camera"
                className="absolute bottom-3 right-3 w-24 h-32 object-cover rounded-sm border-2 border-paper"
              />
            ) : null}
          </div>

          {/* Controls */}
          <div className="p-6 flex flex-col justify-between gap-6 bg-surface">
            <header>
              <p className="text-eyebrow text-primary mb-1">
                {isOutgoing ? 'Outgoing' : 'Incoming'} {mode} call
              </p>
              <h2 className="text-lg font-semibold">{partnerName}</h2>
              <p className="text-sm text-muted mt-1" aria-live="polite">{STATE_LABEL[state]}</p>
            </header>

            <ul className="text-xs text-muted space-y-1">
              <li>• Allow camera/mic when prompted</li>
              <li>• Use headphones to avoid echo</li>
              <li>• If video fails, the call falls back to audio only</li>
            </ul>

            <div className="flex items-center justify-center gap-3 flex-wrap">
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
                      muted ? 'bg-danger text-paper border-danger' : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                    }`}
                  >
                    {muted ? <MicOff size={16} aria-hidden="true" /> : <Mic size={16} aria-hidden="true" />}
                  </button>
                  {showVideo ? (
                    <button
                      type="button"
                      onClick={toggleCamera}
                      aria-label={cameraOff ? 'Turn camera on' : 'Turn camera off'}
                      className={`inline-flex items-center justify-center w-11 h-11 rounded-sm border ${
                        cameraOff ? 'bg-danger text-paper border-danger' : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                      }`}
                    >
                      {cameraOff ? <VideoOff size={16} aria-hidden="true" /> : <Video size={16} aria-hidden="true" />}
                    </button>
                  ) : null}
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
      </div>
    </div>
  )
}
