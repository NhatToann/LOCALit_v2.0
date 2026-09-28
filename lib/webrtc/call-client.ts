/**
 * LOCALit voice-call client (Phase 1, 2026-09-28).
 *
 * Scope:
 *  - Voice only (no camera, no video track).
 *  - Signaling: Supabase Realtime broadcast channel `call:<conversationId>`.
 *    Payload is { kind: 'offer' | 'answer' | 'ice' | 'bye' | 'busy' | 'accept' | 'decline', from, sdp?, candidate? }.
 *  - Lifecycle state is captured in `CallState`. On every terminal state
 *    (ended / declined / missed / failed) we insert ONE row into the
 *    `messages` table with message_type='call_event' so the conversation
 *    keeps a visible log.
 *  - No writes to `call_logs` or `call_signals` (those tables were dropped
 *    on 2026-09-27). The `messages` table is the single source of truth
 *    for chat history, including voice-call events.
 *
 * Browser requirements:
 *  - getUserMedia (mic) over HTTPS or localhost.
 *  - WebRTC (RTCPeerConnection) for audio.
 */

import { createClient } from '@/utils/supabase/auth'

export type CallMode = 'voice'

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'declined'
  | 'missed'
  | 'failed'

export interface CallClientOptions {
  conversationId: string
  myId: string
  peerId: string
  myName: string
  peerName: string
  mode: CallMode
  onState?: (s: CallState) => void
  onError?: (e: Error) => void
  onLocalStream?: (s: MediaStream) => void
  onRemoteStream?: (s: MediaStream) => void
  /** Optional — override for testing */
  now?: () => number
}

export interface CallClient {
  readonly opts: Required<Pick<CallClientOptions, 'onState' | 'onError' | 'onLocalStream' | 'onRemoteStream'>>
  readonly state: CallState
  accept: () => Promise<void>
  decline: () => Promise<void>
  toggleMute: () => boolean
  end: () => Promise<void>
}

type Signal =
  | { kind: 'offer'; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'answer'; from: string; sdp: RTCSessionDescriptionInit }
  | { kind: 'ice'; from: string; candidate: RTCIceCandidateInit }
  | { kind: 'accept'; from: string }
  | { kind: 'decline'; from: string }
  | { kind: 'busy'; from: string }
  | { kind: 'bye'; from: string; duration_seconds?: number }

const DEFAULT_OPTS = {
  onState: (_s: CallState) => {},
  onError: (_e: Error) => {},
  onLocalStream: (_s: MediaStream) => {},
  onRemoteStream: (_s: MediaStream) => {},
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} min ${String(s).padStart(2, '0')} s`
}

/** Append a single call_event row to the conversation. */
async function logCallEvent(
  supabase: ReturnType<typeof createClient>,
  conversationId: string,
  callerId: string,
  content: string,
  durationSeconds: number | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: callerId,
    content,
    message_type: 'call_event',
  }
  if (durationSeconds !== null) {
    payload.metadata = { duration_seconds: durationSeconds }
  }
  try {
    await supabase.from('messages').insert(payload)
    await supabase
      .from('conversations')
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: content,
      })
      .eq('id', conversationId)
  } catch (err) {
    // Logging failure must never crash the call — best-effort.
    // eslint-disable-next-line no-console
    console.warn('[call-client] could not log call_event:', err)
  }
}

export async function startOutgoingCall(opts: CallClientOptions): Promise<{ client: CallClient }> {
  // Force mode='voice' — legacy callers may still pass video.
  const options: CallClientOptions = { ...opts, mode: 'voice' }
  const effectiveOpts = {
    onState: opts.onState ?? DEFAULT_OPTS.onState,
    onError: opts.onError ?? DEFAULT_OPTS.onError,
    onLocalStream: opts.onLocalStream ?? DEFAULT_OPTS.onLocalStream,
    onRemoteStream: opts.onRemoteStream ?? DEFAULT_OPTS.onRemoteStream,
  }

  const supabase = createClient()
  const channel = supabase.channel(`call:${options.conversationId}`, {
    config: { broadcast: { self: false } },
  })

  let pc: RTCPeerConnection | null = null
  let localStream: MediaStream | null = null
  let remoteStream: MediaStream | null = null
  let muted = false
  let state: CallState = 'calling'
  let connectedAt: number | null = null
  let callerId = options.myId // who logs the row in messages
  let ringTimer: ReturnType<typeof setTimeout> | null = null

  function setState(s: CallState) {
    state = s
    effectiveOpts.onState(s)
  }

  function ensurePeer() {
    if (pc) return pc
    pc = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    })
    pc.ontrack = (ev) => {
      if (!remoteStream) remoteStream = new MediaStream()
      remoteStream.addTrack(ev.track)
      effectiveOpts.onRemoteStream(remoteStream)
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate) {
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'ice', from: options.myId, candidate: ev.candidate.toJSON() },
        })
      }
    }
    pc.onconnectionstatechange = () => {
      if (!pc) return
      if (pc.connectionState === 'connected' && state !== 'connected') {
        connectedAt = Date.now()
        setState('connected')
      }
    }
    return pc
  }

  async function acquireMic() {
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
      effectiveOpts.onLocalStream(localStream)
      return localStream
    } catch (err) {
      throw new Error('Microphone permission denied or unavailable.')
    }
  }

  function clearRingTimer() {
    if (ringTimer) {
      clearTimeout(ringTimer)
      ringTimer = null
    }
  }

  // Listen for signaling
  channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
    const sig = payload as Signal
    if (sig.from === options.myId) return
    void handleSignal(sig)
  })

  async function handleSignal(sig: Signal) {
    try {
      if (sig.kind === 'offer') {
        // Callee side: peer is calling us
        clearRingTimer()
        setState('ringing')
        // Prepare mic lazily on accept; nothing else to do here.
        // Persist offer in case user accepts later.
        ;(ensurePeer() as RTCPeerConnection & { _lastOffer?: RTCSessionDescriptionInit })
          ._lastOffer = sig.sdp
      } else if (sig.kind === 'accept') {
        // Caller side: peer accepted → start WebRTC handshake
        clearRingTimer()
        setState('connecting')
        const peer = ensurePeer()
        const stream = await acquireMic()
        for (const t of stream.getTracks()) peer.addTrack(t, stream)
        const offer = await peer.createOffer({ offerToReceiveAudio: true })
        await peer.setLocalDescription(offer)
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'offer', from: options.myId, sdp: offer },
        })
      } else if (sig.kind === 'answer' && state !== 'connected') {
        const peer = ensurePeer()
        await peer.setRemoteDescription(sig.sdp)
      } else if (sig.kind === 'ice') {
        const peer = ensurePeer()
        try {
          await peer.addIceCandidate(sig.candidate)
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[call-client] addIceCandidate failed', err)
        }
      } else if (sig.kind === 'decline') {
        clearRingTimer()
        setState('declined')
        await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · declined', null)
        await cleanup('decline')
      } else if (sig.kind === 'busy') {
        clearRingTimer()
        setState('failed')
        await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · busy', null)
        await cleanup('busy')
      } else if (sig.kind === 'bye') {
        clearRingTimer()
        const dur = connectedAt ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)) : 0
        if (state === 'connected') {
          await logCallEvent(supabase, options.conversationId, callerId, `📞 Voice call · ${fmtDuration(dur)}`, dur)
        }
        setState('ended')
        await cleanup('bye')
      }
    } catch (err) {
      effectiveOpts.onError(err as Error)
    }
  }

  async function sendInitialOffer() {
    setState('calling')
    try {
      // Don't acquire mic yet — only on accept, to avoid prompting too early.
    } catch (err) {
      effectiveOpts.onError(err as Error)
    }
    // Ring timeout: 30s without accept → missed
    ringTimer = setTimeout(async () => {
      if (state === 'calling' || state === 'ringing') {
        setState('missed')
        await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · missed', null)
        await cleanup('missed')
      }
    }, 30_000)

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'offer', from: options.myId, sdp: { type: 'offer', sdp: 'ring' } as RTCSessionDescriptionInit },
        })
      }
    })
  }

  async function cleanup(_reason: string) {
    clearRingTimer()
    try {
      localStream?.getTracks().forEach((t) => t.stop())
    } catch {
      /* noop */
    }
    try {
      pc?.close()
    } catch {
      /* noop */
    }
    try {
      await supabase.removeChannel(channel)
    } catch {
      /* noop */
    }
    localStream = null
    remoteStream = null
    pc = null
  }

  const client: CallClient = {
    get opts() {
      return effectiveOpts
    },
    get state() {
      return state
    },
    accept: async () => {
      if (state !== 'ringing') return
      try {
        const stream = await acquireMic()
        const peer = ensurePeer()
        for (const t of stream.getTracks()) peer.addTrack(t, stream)
        const lastOffer = (peer as RTCPeerConnection & { _lastOffer?: RTCSessionDescriptionInit })._lastOffer
        if (lastOffer) {
          await peer.setRemoteDescription(lastOffer)
          const answer = await peer.createAnswer()
          await peer.setLocalDescription(answer)
          channel.send({
            type: 'broadcast',
            event: 'signal',
            payload: { kind: 'answer', from: options.myId, sdp: answer },
          })
        }
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'accept', from: options.myId },
        })
        setState('connecting')
      } catch (err) {
        setState('failed')
        effectiveOpts.onError(err as Error)
        await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · failed', null)
        await cleanup('accept-fail')
      }
    },
    decline: async () => {
      if (state !== 'ringing') return
      channel.send({
        type: 'broadcast',
        event: 'signal',
        payload: { kind: 'decline', from: options.myId },
      })
      setState('declined')
      await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · declined', null)
      await cleanup('decline')
    },
    toggleMute: () => {
      if (!localStream) return muted
      muted = !muted
      for (const t of localStream.getAudioTracks()) t.enabled = !muted
      return muted
    },
    end: async () => {
      const dur = connectedAt ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)) : 0
      try {
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'bye', from: options.myId, duration_seconds: dur },
        })
      } catch {
        /* noop */
      }
      if (state === 'connected' && dur > 0) {
        await logCallEvent(supabase, options.conversationId, callerId, `📞 Voice call · ${fmtDuration(dur)}`, dur)
      } else if (state === 'connected') {
        await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · ended', 0)
      } else if (state === 'calling' || state === 'ringing' || state === 'connecting') {
        await logCallEvent(supabase, options.conversationId, callerId, '📞 Voice call · cancelled', null)
      }
      setState('ended')
      await cleanup('end')
    },
  }

  await sendInitialOffer()
  return { client }
}
