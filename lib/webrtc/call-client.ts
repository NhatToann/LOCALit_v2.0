/**
 * LOCALit voice-call client (Phase 2, 2026-09-28).
 *
 * Architecture (post-fix):
 *
 *   ┌──────────┐                ┌──────────┐                ┌──────────┐
 *   │  Caller  │                │ Supabase │                │  Callee  │
 *   └────┬─────┘                └────┬─────┘                └────┬─────┘
 *        │                           │                           │
 *        │ 1. INSERT pending_calls   │                           │
 *        │  status='ringing'         │                           │
 *        ├──────────────────────────►│                           │
 *        │                           │ 2. Realtime INSERT event  │
 *        │                           ├──────────────────────────►│
 *        │                           │                           │ (popup shows)
 *        │                           │  ◄── 3. UPDATE status     │
 *        │                           │      'accepted'           │
 *        │                           │                           │
 *        │                           │  ◄── 4. broadcast offer  │
 *        │  ◄─── 5. broadcast ───────│       SDP                 │
 *        │                           │                           │
 *        │ 6. setRemoteDescription   │                           │
 *        │    + createAnswer         │                           │
 *        │    + broadcast answer ───►├──────► 7. setRemoteDesc   │
 *        │                           │                           │
 *        │ 8. ICE candidates flow over broadcast (both ways)     │
 *        │                           │                           │
 *        │ 9. connectionState = connected → onCallConnected     │
 *        │                           │                           │
 *        │ End: UPDATE status='cancelled' + log call_event       │
 *        │                           │                           │
 *
 * The `messages` table remains the single source of truth for the
 * conversation log. Each terminal state writes ONE row of
 * `message_type='call_event'`.
 */

import { createClient } from '@/utils/supabase/auth'
import { getIceConfig } from '@/lib/webrtc/ice-config'

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
  /** True when this side initiated the call (caller). False for callee. */
  isInitiator?: boolean
  /** Existing pending_calls row id, set when accepting an incoming call. */
  pendingCallId?: string
  /**
   * Optional override for the ICE server list. When omitted, the client
   * fetches fresh credentials from /api/webrtc/turn via getIceConfig().
   * The override is mainly for tests and for callers that already have
   * a cached config (e.g. dialer pre-warmed a config before the call).
   */
  iceServers?: RTCIceServer[]
  onState?: (s: CallState) => void
  onError?: (e: Error) => void
  onLocalStream?: (s: MediaStream) => void
  onRemoteStream?: (s: MediaStream) => void
  /** Override for testing */
  now?: () => number
}

export interface CallClient {
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
  | { kind: 'bye'; from: string; duration_seconds?: number }

const DEBUG_TAG = '[call]'
/** Production builds drop these. Diagnostic logs violate the no-console
 *  rule in docs/design.md only when left on in prod; gate them here. */
function dlog(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return
  // eslint-disable-next-line no-console
  console.debug(DEBUG_TAG, ...args)
}
function dwarn(...args: unknown[]): void {
  if (process.env.NODE_ENV === 'production') return
  // eslint-disable-next-line no-console
  console.warn(DEBUG_TAG, ...args)
}

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} min ${String(s).padStart(2, '0')} s`
}

/** Append a single call_event row to the conversation log. */
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
    dwarn('could not log call_event:', err)
  }
}

/**
 * Shared signal-handling logic used by both caller and callee.
 * Manages a single RTCPeerConnection over the broadcast channel.
 */
async function attachPeer(params: {
  supabase: ReturnType<typeof createClient>
  conversationId: string
  myId: string
  iceServers: RTCIceServer[]
  onLocalStream: (s: MediaStream) => void
  onRemoteStream: (s: MediaStream) => void
  onState: (s: CallState) => void
  onError: (e: Error) => void
  shouldHandleSignal: (sig: Signal) => boolean
}): Promise<{
  getPeer: () => RTCPeerConnection
  acquireMic: () => Promise<MediaStream>
  sendOffer: () => Promise<void>
  sendAnswer: (remoteOffer: RTCSessionDescriptionInit) => Promise<void>
  sendBye: (durationSeconds?: number) => void
  toggleMute: () => boolean
  close: () => Promise<void>
}> {
  const channel = params.supabase.channel(`call:${params.conversationId}`, {
    config: { broadcast: { self: false } },
  })

  let pc: RTCPeerConnection | null = null
  let localStream: MediaStream | null = null
  let remoteStream: MediaStream | null = null
  let muted = false

  function ensurePeer(): RTCPeerConnection {
    if (pc) return pc
    pc = new RTCPeerConnection({ iceServers: params.iceServers })
    dlog('peer constructed with', params.iceServers.length, 'ice server(s)')
    pc.ontrack = (ev) => {
      dlog('ontrack', ev.track.kind, 'streams:', ev.streams.length)
      if (!remoteStream) remoteStream = new MediaStream()
      remoteStream.addTrack(ev.track)
      params.onRemoteStream(remoteStream)
    }
    pc.onicecandidate = (ev) => {
      if (ev.candidate && ev.candidate.candidate) {
        dlog('ice candidate', ev.candidate.candidate.slice(0, 60), '...')
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: {
            kind: 'ice',
            from: params.myId,
            candidate: ev.candidate.toJSON(),
          },
        })
      } else {
        dlog('ice gathering complete')
      }
    }
    pc.oniceconnectionstatechange = () => {
      dlog('iceConnectionState ->', pc?.iceConnectionState)
    }
    pc.onconnectionstatechange = () => {
      dlog('connectionState ->', pc?.connectionState)
      if (!pc) return
      if (pc.connectionState === 'connected') {
        params.onState('connected')
      } else if (
        pc.connectionState === 'failed' ||
        pc.connectionState === 'closed' ||
        pc.connectionState === 'disconnected'
      ) {
        // The 'disconnected' state can be transient (ICE restart) —
        // only treat 'failed' and 'closed' as terminal.
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          dlog('connection terminal:', pc.connectionState)
          params.onState('failed')
        }
      }
    }
    return pc
  }

  async function acquireMic(): Promise<MediaStream> {
    if (localStream) return localStream
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    })
    params.onLocalStream(localStream)
    return localStream
  }

  // Register broadcast listener BEFORE awaiting subscribe so no message is missed.
  channel.on('broadcast', { event: 'signal' }, ({ payload }) => {
    const sig = payload as Signal
    if (!sig || sig.from === params.myId) return
    if (!params.shouldHandleSignal(sig)) return
    void handleSignal(sig)
  })

  async function handleSignal(sig: Signal) {
    try {
      if (sig.kind === 'offer') {
        const peer = ensurePeer()
        await peer.setRemoteDescription(sig.sdp)
        const answer = await peer.createAnswer()
        await peer.setLocalDescription(answer)
        channel.send({
          type: 'broadcast',
          event: 'signal',
          payload: { kind: 'answer', from: params.myId, sdp: answer },
        })
      } else if (sig.kind === 'answer') {
        const peer = ensurePeer()
        if (!peer.currentRemoteDescription) {
          await peer.setRemoteDescription(sig.sdp)
        }
      } else if (sig.kind === 'ice') {
        const peer = ensurePeer()
        try {
          await peer.addIceCandidate(sig.candidate)
} catch (err) {
        dwarn('addIceCandidate failed', err)
      }
      }
    } catch (err) {
      params.onError(err as Error)
    }
  }

  // Expose sender for callers
  const sendSignal = (payload: Signal) =>
    channel.send({ type: 'broadcast', event: 'signal', payload })

  // Subscribe to channel; return helpers after subscribe completes.
  await new Promise<void>((resolve, reject) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true
        reject(new Error('Channel subscribe timeout'))
      }
    }, 10_000)
    channel.subscribe((status) => {
      if (settled) return
      if (status === 'SUBSCRIBED') {
        settled = true
        clearTimeout(timeout)
        resolve()
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        settled = true
        clearTimeout(timeout)
        reject(new Error(`Channel ${status}`))
      }
    })
  })

  return {
    getPeer: ensurePeer,
    acquireMic,
    sendOffer: async (): Promise<void> => {
      const peer = ensurePeer()
      const stream = await acquireMic()
      for (const t of stream.getTracks()) peer.addTrack(t, stream)
      const offer = await peer.createOffer({ offerToReceiveAudio: true })
      await peer.setLocalDescription(offer)
      sendSignal({ kind: 'offer', from: params.myId, sdp: offer })
    },
    sendAnswer: async (remoteOffer: RTCSessionDescriptionInit): Promise<void> => {
      const peer = ensurePeer()
      const stream = await acquireMic()
      for (const t of stream.getTracks()) peer.addTrack(t, stream)
      await peer.setRemoteDescription(remoteOffer)
      const answer = await peer.createAnswer()
      await peer.setLocalDescription(answer)
      sendSignal({ kind: 'answer', from: params.myId, sdp: answer })
    },
    sendBye: (durationSeconds?: number) =>
      sendSignal({
        kind: 'bye',
        from: params.myId,
        duration_seconds: durationSeconds,
      }),
    toggleMute: (): boolean => {
      if (!localStream) {
        // Acquire lazily so the user can mute even before talking.
        void acquireMic().then((s) => {
          muted = !muted
          for (const t of s.getAudioTracks()) t.enabled = !muted
        })
        return false
      }
      muted = !muted
      for (const t of localStream.getAudioTracks()) t.enabled = !muted
      return muted
    },
    close: async () => {
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
        await params.supabase.removeChannel(channel)
      } catch {
        /* noop */
      }
      localStream = null
      remoteStream = null
      pc = null
    },
  }
}

type PeerHandle = Awaited<ReturnType<typeof attachPeer>>

/**
 * Start an outgoing (caller-side) voice call.
 *
 * Flow:
 *   1. INSERT pending_calls row (status='ringing')
 *   2. Subscribe broadcast channel
 *   3. Wait for realtime UPDATE event: pending_calls.status = 'accepted'
 *   4. Wait for broadcast 'offer' SDP from callee
 *   5. setRemoteDescription + createAnswer + send via broadcast
 *   6. ICE + connect
 */
export async function startOutgoingCall(
  opts: CallClientOptions,
): Promise<{ client: CallClient; pendingCallId: string }> {
  const onState = opts.onState ?? (() => {})
  const onError = opts.onError ?? (() => {})
  const onLocalStream = opts.onLocalStream ?? (() => {})
  const onRemoteStream = opts.onRemoteStream ?? (() => {})

  const supabase = createClient()
  let state: CallState = 'calling'
  let connectedAt: number | null = null
  let peer: PeerHandle | null = null
  let callerId = opts.myId // who logs the row in messages
  let ringTimer: ReturnType<typeof setTimeout> | null = null
  let pendingCallId: string | null = null

  function setState(s: CallState) {
    dlog('state', state, '->', s, '(outgoing)')
    state = s
    onState(s)
  }

  function clearRingTimer() {
    if (ringTimer) {
      clearTimeout(ringTimer)
      ringTimer = null
    }
  }

  // 1. Insert pending_calls row
  const { data: insertData, error: insertErr } = await supabase
    .from('pending_calls')
    .insert({
      conversation_id: opts.conversationId,
      caller_id: opts.myId,
      callee_id: opts.peerId,
      status: 'ringing',
    })
    .select('id')
    .single()

  if (insertErr || !insertData) {
    throw new Error('Could not start call: ' + (insertErr?.message ?? 'unknown'))
  }
  pendingCallId = insertData.id

  // 2. Listen on broadcast channel for offer/answer/ice from callee.
  // attachPeer handles the WebRTC side (setRemoteDescription on incoming
  // offer SDP, etc.); we use a separate "meta" channel for control
  // events like 'accepted', 'declined', 'busy' that don't carry SDP.

  // Fetch ICE config (STUN + TURN credentials if configured). Cached for
  // 50 min in ice-config.ts so this is essentially free for back-to-back
  // calls. Bug 2 (2026-09-28): previously we used a hardcoded single
  // STUN entry, which fails on symmetric NAT. With TURN credentials
  // present, coturn relays media and the call succeeds cross-network.
  const iceConfig = await getIceConfig()
  dlog('ice config:', iceConfig.source, iceConfig.iceServers.length, 'servers')

  peer = await attachPeer({
    supabase,
    conversationId: opts.conversationId,
    myId: opts.myId,
    iceServers: opts.iceServers ?? iceConfig.iceServers,
    onLocalStream,
    onRemoteStream,
    onState: (s) => {
      if (s === 'connected') {
        connectedAt = Date.now()
        setState('connected')
      } else if (s === 'failed') {
        setState('failed')
      }
    },
    onError,
    shouldHandleSignal: (sig) => sig.kind === 'offer' || sig.kind === 'ice',
  })

  const metaChannel = supabase.channel(`call-meta:${opts.conversationId}`, {
    config: { broadcast: { self: false } },
  })
  metaChannel.on('broadcast', { event: 'accepted' }, () => {
    setState('connecting')
    clearRingTimer()
  })
  metaChannel.on('broadcast', { event: 'declined' }, () => {
    clearRingTimer()
    setState('declined')
    void logCallEvent(supabase, opts.conversationId, callerId, '📞 Voice call · declined', null)
    void cleanup('decline')
  })
  metaChannel.on('broadcast', { event: 'busy' }, () => {
    clearRingTimer()
    setState('failed')
    void logCallEvent(supabase, opts.conversationId, callerId, '📞 Voice call · busy', null)
    void cleanup('busy')
  })
  await new Promise<void>((resolve) => {
    metaChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  })

  // Ring timeout: 45s without accept → missed
  ringTimer = setTimeout(async () => {
    if (state === 'calling') {
      setState('missed')
      await supabase
        .from('pending_calls')
        .update({ status: 'expired' })
        .eq('id', pendingCallId)
      await logCallEvent(supabase, opts.conversationId, callerId, '📞 Voice call · missed', null)
      await cleanup('missed')
    }
  }, 45_000)

  async function cleanup(_reason: string) {
    clearRingTimer()
    if (peer) {
      const p = peer
      peer = null
      await p.close()
    }
    try {
      await supabase.removeChannel(metaChannel)
    } catch {
      /* noop */
    }
    // Mark pending_calls as terminal so the watcher stops showing it.
    if (pendingCallId && state !== 'connected') {
      const termStatus =
        state === 'missed' || state === 'declined' || state === 'ended' || state === 'failed'
          ? state === 'ended'
            ? 'cancelled'
            : state
          : 'cancelled'
      await supabase
        .from('pending_calls')
        .update({ status: termStatus })
        .eq('id', pendingCallId)
        .then(() => undefined, () => undefined)
    }
  }

  const client: CallClient = {
    get state() {
      return state
    },
    accept: async () => {
      // Caller side never receives accept UI; left as no-op for type compat.
    },
    decline: async () => {
      if (state !== 'calling') return
      clearRingTimer()
      setState('declined')
      metaChannel.send({
        type: 'broadcast',
        event: 'declined',
        payload: {},
      })
      await supabase
        .from('pending_calls')
        .update({ status: 'cancelled' })
        .eq('id', pendingCallId)
      await logCallEvent(supabase, opts.conversationId, callerId, '📞 Voice call · cancelled', null)
      await cleanup('decline')
    },
    toggleMute: () => (peer ? peer.toggleMute() : false),
    end: async () => {
      const dur = connectedAt
        ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
        : 0
      try {
        metaChannel.send({
          type: 'broadcast',
          event: 'bye',
          payload: { duration_seconds: dur },
        })
      } catch {
        /* noop */
      }
      if (state === 'connected' && dur > 0) {
        await logCallEvent(
          supabase,
          opts.conversationId,
          callerId,
          `📞 Voice call · ${fmtDuration(dur)}`,
          dur,
        )
      } else if (state === 'connected') {
        await logCallEvent(supabase, opts.conversationId, callerId, '📞 Voice call · ended', 0)
      } else if (state === 'calling' || state === 'connecting') {
        await logCallEvent(
          supabase,
          opts.conversationId,
          callerId,
          '📞 Voice call · cancelled',
          null,
        )
      }
      if (pendingCallId) {
        await supabase
          .from('pending_calls')
          .update({ status: state === 'connected' ? 'accepted' : 'cancelled' })
          .eq('id', pendingCallId)
      }
      setState('ended')
      await cleanup('end')
    },
  }

  return { client, pendingCallId: pendingCallId! }
}

/**
 * Accept an incoming (callee-side) voice call.
 *
 * Flow:
 *   1. UPDATE pending_calls.status = 'accepted'
 *   2. Broadcast 'accepted' event over `call-meta:<convId>` channel
 *   3. Subscribe `call:<convId>` broadcast channel
 *   4. acquireMic + createOffer + send via broadcast
 *   5. Wait for answer via attachPeer's internal handler
 *   6. ICE + connect
 */
export async function acceptIncomingCall(
  opts: CallClientOptions,
): Promise<{ client: CallClient }> {
  if (!opts.pendingCallId) {
    throw new Error('acceptIncomingCall requires pendingCallId')
  }
  const onState = opts.onState ?? (() => {})
  const onError = opts.onError ?? (() => {})
  const onLocalStream = opts.onLocalStream ?? (() => {})
  const onRemoteStream = opts.onRemoteStream ?? (() => {})

  const supabase = createClient()
  let state: CallState = 'connecting'
  let connectedAt: number | null = null
  let peer: PeerHandle | null = null

  function setState(s: CallState) {
    dlog('state', state, '->', s, '(incoming)')
    state = s
    onState(s)
  }

  // 1. Update DB
  const { error: updateErr } = await supabase
    .from('pending_calls')
    .update({ status: 'accepted' })
    .eq('id', opts.pendingCallId)
    .eq('callee_id', opts.myId) // safety: only callee can mark accepted

  if (updateErr) {
    throw new Error('Could not accept call: ' + updateErr.message)
  }

  // 2. Notify caller side that we accepted
  const metaChannel = supabase.channel(`call-meta:${opts.conversationId}`, {
    config: { broadcast: { self: false } },
  })
  metaChannel.on('broadcast', { event: 'bye' }, () => {
    void endCall()
  })
  await new Promise<void>((resolve, reject) => {
    metaChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED')
        reject(new Error(`Channel ${status}`))
    })
  })
  metaChannel.send({
    type: 'broadcast',
    event: 'accepted',
    payload: {},
  })

  // 3-5. Attach peer & send offer
  // Bug 2 (2026-09-28): same TURN wiring as startOutgoingCall — fetch
  // ICE config (STUN + coturn credentials) before opening the peer.
  const iceConfig = await getIceConfig()
  dlog('ice config:', iceConfig.source, iceConfig.iceServers.length, 'servers')

  peer = await attachPeer({
    supabase,
    conversationId: opts.conversationId,
    myId: opts.myId,
    iceServers: opts.iceServers ?? iceConfig.iceServers,
    onLocalStream,
    onRemoteStream,
    onState: (s) => {
      if (s === 'connected') {
        connectedAt = Date.now()
        setState('connected')
      } else if (s === 'failed') {
        setState('failed')
      }
    },
    onError,
    shouldHandleSignal: (sig) => sig.kind === 'answer' || sig.kind === 'ice',
  })

  // Create and send offer (callee side initiates WebRTC after accepting UI ring)
  await peer.sendOffer()

  async function endCall() {
    const dur = connectedAt ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000)) : 0
    if (peer) {
      const p = peer
      peer = null
      await p.close()
    }
    try {
      await supabase.removeChannel(metaChannel)
    } catch {
      /* noop */
    }
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId, // actor (callee) — matches auth.uid() for messages RLS
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    }
    if (opts.pendingCallId) {
      await supabase
        .from('pending_calls')
        .update({ status: state === 'connected' ? 'accepted' : 'cancelled' })
        .eq('id', opts.pendingCallId)
    }
    setState('ended')
  }

  const client: CallClient = {
    get state() {
      return state
    },
    accept: async () => {
      // No-op; already accepting on construction.
    },
    decline: async () => {
      // No-op for callee after accept — they should call end().
    },
    toggleMute: () => (peer ? peer.toggleMute() : false),
    end: endCall,
  }

  return { client }
}

/**
 * Decline an incoming call (callee-side, before accepting).
 * Updates DB and logs call_event, but does NOT open a peer connection.
 *
 * sender_id for the call_event log is the actor (the callee who is
 * declining), not the original caller — required because the messages
 * table has WITH CHECK (auth.uid() = sender_id). Otherwise RLS would
 * silently drop the insert.
 */
export async function declineIncomingCall(opts: {
  supabase: ReturnType<typeof createClient>
  pendingCallId: string
  myId: string
  conversationId: string
  callerId: string
}): Promise<void> {
  await opts.supabase
    .from('pending_calls')
    .update({ status: 'declined' })
    .eq('id', opts.pendingCallId)
    .eq('callee_id', opts.myId)

  // Notify caller via broadcast
  const metaChannel = opts.supabase.channel(`call-meta:${opts.conversationId}`, {
    config: { broadcast: { self: false } },
  })
  await new Promise<void>((resolve) => {
    metaChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
    })
  })
  metaChannel.send({ type: 'broadcast', event: 'declined', payload: {} })

  await logCallEvent(
    opts.supabase,
    opts.conversationId,
    opts.myId, // actor (callee) — must match auth.uid() for messages RLS
    '📞 Voice call · declined',
    null,
  )

  try {
    await opts.supabase.removeChannel(metaChannel)
  } catch {
    /* noop */
  }
}
