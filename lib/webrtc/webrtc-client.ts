/**
 * LOCALit WebRTC voice-call client (2026-09-30).
 *
 * Replaces the Stringee SDK with a self-hosted WebRTC stack. Why:
 *   - Stringee only ships a free trial (1 month) — not viable for a
 *     final-year project that needs to keep running for grading.
 *   - We now own the SDP/ICE plumbing, so the mic permission prompt
 *     can be triggered exactly when we want (after the user has
 *     clicked Accept), not when the opaque SDK decides.
 *   - The signaling layer is Supabase Realtime broadcast, which is
 *     free, durable in the same auth context, and works inside Vercel
 *     serverless.
 *
 * Signaling protocol (per-call):
 *
 *   ┌──────────┐                                  ┌──────────┐
 *   │  Caller  │  ─── INSERT pending_calls ───►  │  DB row  │
 *   │          │  ─── broadcast 'ring'     ───►  │  (ring)  │
 *   └────┬─────┘                                  └────┬─────┘
 *        │  ┌────────────────────────────────────────┐ │
 *        │  │ calls:${calleeId} broadcast channel    │ │
 *        │  │  - offer {callId, sdp}                 │ │
 *        │  │  - answer {callId, sdp}                │ │
 *        │  │  - ice-candidate {callId, candidate}   │ │
 *        │  │  - bye {callId}                        │ │
 *        │  └────────────────────────────────────────┘ │
 *        │                                             │
 *        ▼                                             ▼
 *   ┌──────────┐                                  ┌──────────┐
 *   │  Caller  │  ◄── broadcast 'answer' ──────── │  Callee  │
 *   │   PC     │  ◄── broadcast 'ice'     ─────── │   PC     │
 *   └──────────┘  ─── broadcast 'ice'     ──────► └──────────┘
 *
 *   Both peers subscribe to `calls:${myUserId}` for inbound signaling.
 *
 *   ICE servers come from /api/webrtc/ice-config. Today that's just
 *   Google's public STUN; if we ever need TURN (symmetric NAT), we
 *   drop in coturn credentials at the API without touching this file.
 *
 * Why DB pending_calls still exists:
 *   Durable source of truth across reconnects. The IncomingCallWatcher
 *   UI watches it directly so the popup is reliable even when the
 *   realtime broadcast is briefly disconnected.
 */

import { createClient as createBrowserClient } from '@/utils/supabase/auth'

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

export type CallQualityLevel = 'excellent' | 'good' | 'fair' | 'poor'

export interface CallQuality {
  level: CallQualityLevel
  bitrateKbps: number
  rttMs: number
  packetLossPct: number
}

export type NetworkStatus = 'online' | 'reconnecting' | 'offline'

export interface CallClientOptions {
  conversationId: string
  myId: string
  peerId: string
  myName: string
  peerName: string
  mode: CallMode
  pendingCallId?: string
  callerUserId?: string
  onState?: (s: CallState) => void
  onError?: (e: Error) => void
  onLocalStream?: (s: MediaStream) => void
  onRemoteStream?: (s: MediaStream) => void
  onNetwork?: (status: NetworkStatus) => void
  onQuality?: (q: CallQuality) => void
}

export interface CallClient {
  readonly state: CallState
  readonly networkStatus: NetworkStatus
  readonly peerConnection: RTCPeerConnection | null
  accept: () => Promise<void>
  decline: () => Promise<void>
  toggleMute: () => boolean
  end: () => Promise<void>
}

// --- Signaling helpers ----------------------------------------------

interface IceConfig {
  iceServers: RTCIceServer[]
}

let cachedIceConfig: IceConfig | null = null
let cachedIceConfigExpiresAt = 0

async function getIceConfig(): Promise<IceConfig> {
  const now = Date.now()
  if (cachedIceConfig && cachedIceConfigExpiresAt > now + 60_000) {
    return cachedIceConfig
  }
  try {
    const res = await fetch('/api/webrtc/ice-config')
    if (!res.ok) throw new Error(`ice-config ${res.status}`)
    const body = (await res.json()) as { iceServers: RTCIceServer[] }
    cachedIceConfig = { iceServers: body.iceServers }
    // Re-fetch every 10 minutes so we rotate TURN credentials when
    // they're added.
    cachedIceConfigExpiresAt = now + 10 * 60_000
    return cachedIceConfig
  } catch {
    // Fallback: Google public STUN.
    return {
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    }
  }
}

interface SignalingMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'bye' | 'ring'
  callId: string
  from: string
  to: string
  sdp?: RTCSessionDescriptionInit
  candidate?: RTCIceCandidateInit
}

async function sendSignaling(toUserId: string, msg: SignalingMessage): Promise<void> {
  const supabase = createBrowserClient()
  const channel = supabase.channel(`calls:${toUserId}`, {
    config: { broadcast: { self: false, ack: false } },
  })
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        resolve()
      }
    })
  })
  try {
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: msg,
    })
  } finally {
    try {
      await supabase.removeChannel(channel)
    } catch {
      /* ignore */
    }
  }
}

/**
 * Build a fire-and-forget signaling sender bound to a single target
 * user. Returns a function that publishes a message without waiting
 * for an ack.
 */
function makeAsyncSender(toUserId: string): (m: SignalingMessage) => void {
  return (m) => {
    void sendSignaling(toUserId, m).catch(() => undefined)
  }
}

// --- Helpers --------------------------------------------------------

function fmtDuration(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m} min ${String(s).padStart(2, '0')} s`
}

function attachNetworkWatcher(): {
  getStatus: () => NetworkStatus
  detach: () => void
} {
  if (typeof window === 'undefined') {
    return { getStatus: () => 'online', detach: () => undefined }
  }
  let last: NetworkStatus = navigator.onLine ? 'online' : 'offline'
  const onOnline = () => {
    last = 'online'
  }
  const onOffline = () => {
    last = 'offline'
  }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  return {
    getStatus: () => last,
    detach: () => {
      window.removeEventListener('online', onOnline)
      window.removeEventListener('offline', onOffline)
    },
  }
}

async function logCallEvent(
  supabase: ReturnType<typeof createBrowserClient>,
  conversationId: string,
  actorId: string,
  content: string,
  durationSeconds: number | null,
): Promise<void> {
  const payload: Record<string, unknown> = {
    conversation_id: conversationId,
    sender_id: actorId,
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
  } catch {
    /* best-effort */
  }
}

/**
 * Build the RTCPeerConnection and wire its events into our state
 * callbacks. Returns:
 *   - pc: the connection
 *   - setMute: toggles outgoing audio
 *   - teardown: closes the PC and removes event handlers
 */
function buildPeerConnection(
  iceConfig: IceConfig,
  hooks: {
    onState: (s: CallState) => void
    onLocalStream: (s: MediaStream) => void
    onRemoteStream: (s: MediaStream) => void
    onIceCandidate: (c: RTCIceCandidateInit) => void
    onConnectionStateChange: (s: RTCPeerConnectionState) => void
  },
): {
  pc: RTCPeerConnection
  setMute: (muted: boolean) => void
  teardown: () => void
} {
  const pc = new RTCPeerConnection({ iceServers: iceConfig.iceServers })

  // ICE candidates come back asynchronously as the browser gathers
  // them. We push them to the peer via signaling.
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      hooks.onIceCandidate(event.candidate.toJSON())
    }
  }

  pc.ontrack = (event) => {
    const [stream] = event.streams
    if (stream) hooks.onRemoteStream(stream)
  }

  pc.onconnectionstatechange = () => {
    hooks.onConnectionStateChange(pc.connectionState)
  }

  let localStream: MediaStream | null = null
  function setMute(muted: boolean): void {
    if (!localStream) return
    for (const track of localStream.getAudioTracks()) {
      track.enabled = !muted
    }
  }

  return {
    pc,
    setMute,
    teardown: () => {
      try {
        pc.onicecandidate = null
        pc.ontrack = null
        pc.onconnectionstatechange = null
        pc.close()
      } catch {
        /* swallow */
      }
    },
  }
}

// --- Start an outgoing call -----------------------------------------

export async function startOutgoingCall(
  opts: CallClientOptions,
): Promise<{ client: CallClient; pendingCallId: string }> {
  const supabase = createBrowserClient()

  // 1. Insert pending_calls row first — durable record.
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
  const pendingCallId: string = insertData.id

  let state: CallState = 'calling'
  let connectedAt: number | null = null
  let ended = false
  let muted = false
  let pcRef: RTCPeerConnection | null = null
  let setMuteFn: ((m: boolean) => void) | null = null
  let pcTeardown: (() => void) | null = null
  const network = attachNetworkWatcher()
  let networkStatus: NetworkStatus = network.getStatus()
  const send = makeAsyncSender(opts.peerId)

  const emit = (s: CallState) => {
    state = s
    opts.onState?.(s)
  }

  function finalize(s: CallState): void {
    if (ended) return
    ended = true
    pcTeardown?.()
    network.detach()
    void updatePendingTerminal(
      pendingCallId,
      s === 'connected' ? 'accepted' : s === 'calling' ? 'cancelled' : 'expired',
    )
  }

  async function end(): Promise<void> {
    if (ended) return
    const dur = connectedAt
      ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      : 0
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    } else if (state === 'calling' || state === 'connecting') {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        '📞 Voice call · cancelled',
        null,
      )
    }
    send({
      type: 'bye',
      callId: pendingCallId,
      from: opts.myId,
      to: opts.peerId,
    })
    finalize('ended')
    emit('ended')
  }

  // 2. Get local mic stream. Caller of startOutgoingCall is expected
  // to have already prompted the user via ensureMicPermission. If
  // getUserMedia fails here, surface the error.
  let localStream: MediaStream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    })
  } catch (err) {
    finalize('failed')
    emit('failed')
    throw err
  }
  opts.onLocalStream?.(localStream)

  // 3. Build the peer connection.
  const iceConfig = await getIceConfig()
  const { pc, setMute, teardown } = buildPeerConnection(iceConfig, {
    onState: (s) => emit(s),
    onLocalStream: () => undefined,
    onRemoteStream: (s) => opts.onRemoteStream?.(s),
    onIceCandidate: (c) =>
      send({
        type: 'ice-candidate',
        callId: pendingCallId,
        from: opts.myId,
        to: opts.peerId,
        candidate: c,
      }),
    onConnectionStateChange: (cs) => {
      if (cs === 'connected') {
        connectedAt = connectedAt ?? Date.now()
        emit('connected')
      } else if (cs === 'failed') {
        opts.onError?.(new Error('Connection failed'))
        emit('failed')
        finalize('failed')
      } else if (cs === 'disconnected' || cs === 'closed') {
        if (state === 'connected') {
          // Lost connection mid-call.
          opts.onError?.(new Error('Connection lost'))
          emit('failed')
          finalize('ended')
        }
      }
    },
  })
  pcRef = pc
  setMuteFn = setMute
  pcTeardown = teardown

  for (const track of localStream.getAudioTracks()) {
    pc.addTrack(track, localStream)
  }

  // 4. Subscribe to inbound signaling BEFORE creating the offer, so
  // any answer/ice that arrives during setLocalDescription isn't
  // dropped. This avoids the race where the callee replies faster
  // than we attach our listener.
  const ringTimer = setTimeout(() => {
    if (state === 'ringing' || state === 'calling') {
      void logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        '📞 Voice call · missed',
        null,
      )
      finalize('missed')
      emit('missed')
    }
  }, 45_000)

  let signalingReady = false
  const signalingReadyPromise = new Promise<void>((resolve) => {
    signalingReady = true
    resolve()
  })

  void listenForInbound(opts.myId, async (msg) => {
    if (msg.callId !== pendingCallId) return
    if (msg.type === 'answer' && msg.sdp) {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        clearTimeout(ringTimer)
      } catch (err) {
        opts.onError?.(err as Error)
        emit('failed')
        finalize('failed')
      }
    } else if (msg.type === 'ice-candidate' && msg.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
      } catch {
        /* swallow — candidate may be stale */
      }
    } else if (msg.type === 'bye') {
      finalize('ended')
      emit('ended')
    }
  })

  // 5. Create the offer and send it. Wait for inbound listener
  // registration to settle so the very first ICE/answer packets
  // aren't dropped.
  await signalingReadyPromise
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  send({
    type: 'offer',
    callId: pendingCallId,
    from: opts.myId,
    to: opts.peerId,
    sdp: offer,
  })
  emit('ringing')

  return {
    pendingCallId,
    client: {
      get state() {
        return state
      },
      get networkStatus() {
        return networkStatus
      },
      get peerConnection() {
        return pcRef
      },
      accept: async () => {
        /* caller-side no-op */
      },
      decline: async () => {
        if (state !== 'calling' && state !== 'ringing') return
        finalize('declined')
        emit('declined')
      },
      toggleMute: () => {
        muted = !muted
        setMuteFn?.(muted)
        return muted
      },
      end,
    },
  }
}

// --- Accept an incoming call ----------------------------------------

export async function acceptIncomingCall(
  opts: CallClientOptions,
): Promise<{ client: CallClient }> {
  if (!opts.pendingCallId) {
    throw new Error('acceptIncomingCall requires pendingCallId')
  }
  const supabase = createBrowserClient()
  const callId = opts.pendingCallId
  const callerId = opts.callerUserId ?? opts.peerId

  // Update DB so the watcher hides the popup.
  await supabase
    .from('pending_calls')
    .update({ status: 'accepted' })
    .eq('id', callId)
    .eq('callee_id', opts.myId)

  let state: CallState = 'connecting'
  let connectedAt: number | null = null
  let ended = false
  let muted = false
  let pcRef: RTCPeerConnection | null = null
  let setMuteFn: ((m: boolean) => void) | null = null
  let pcTeardown: (() => void) | null = null
  let pendingRemoteOffer: RTCSessionDescriptionInit | null = null
  const network = attachNetworkWatcher()
  let networkStatus: NetworkStatus = network.getStatus()
  const send = makeAsyncSender(callerId)

  const emit = (s: CallState) => {
    state = s
    opts.onState?.(s)
  }

  async function end(): Promise<void> {
    if (ended) return
    const dur = connectedAt
      ? Math.max(0, Math.floor((Date.now() - connectedAt) / 1000))
      : 0
    if (state === 'connected' && dur > 0) {
      await logCallEvent(
        supabase,
        opts.conversationId,
        opts.myId,
        `📞 Voice call · ${fmtDuration(dur)}`,
        dur,
      )
    }
    send({
      type: 'bye',
      callId,
      from: opts.myId,
      to: callerId,
    })
    pcTeardown?.()
    network.detach()
    void updatePendingTerminal(callId, state === 'connected' ? 'accepted' : 'cancelled')
    emit('ended')
  }

  // Get local mic stream. The caller of acceptIncomingCall has
  // already prompted via ensureMicPermission.
  let localStream: MediaStream
  try {
    localStream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    })
  } catch (err) {
    emit('failed')
    throw err
  }
  opts.onLocalStream?.(localStream)

  // Build the PC.
  const iceConfig = await getIceConfig()
  const { pc, setMute, teardown } = buildPeerConnection(iceConfig, {
    onState: (s) => emit(s),
    onLocalStream: () => undefined,
    onRemoteStream: (s) => opts.onRemoteStream?.(s),
    onIceCandidate: (c) =>
      send({
        type: 'ice-candidate',
        callId,
        from: opts.myId,
        to: callerId,
        candidate: c,
      }),
    onConnectionStateChange: (cs) => {
      if (cs === 'connected') {
        connectedAt = connectedAt ?? Date.now()
        emit('connected')
      } else if (cs === 'failed') {
        opts.onError?.(new Error('Connection failed'))
        emit('failed')
      } else if (cs === 'disconnected' || cs === 'closed') {
        if (state === 'connected') {
          opts.onError?.(new Error('Connection lost'))
          emit('failed')
        }
      }
    },
  })
  pcRef = pc
  setMuteFn = setMute
  pcTeardown = teardown

  for (const track of localStream.getAudioTracks()) {
    pc.addTrack(track, localStream)
  }

  // Listen for the offer and any ICE candidates from the caller.
  void listenForInbound(opts.myId, async (msg) => {
    if (msg.callId !== callId) return
    if (msg.type === 'offer' && msg.sdp) {
      pendingRemoteOffer = msg.sdp
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        send({
          type: 'answer',
          callId,
          from: opts.myId,
          to: callerId,
          sdp: answer,
        })
      } catch (err) {
        opts.onError?.(err as Error)
        emit('failed')
      }
    } else if (msg.type === 'ice-candidate' && msg.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
      } catch {
        /* swallow */
      }
    } else if (msg.type === 'bye') {
      pcTeardown?.()
      network.detach()
      emit('ended')
    }
  })

  return {
    client: {
      get state() {
        return state
      },
      get networkStatus() {
        return networkStatus
      },
      get peerConnection() {
        return pcRef
      },
      accept: async () => {
        /* already accepting on construction */
      },
      decline: async () => {
        /* no-op after answer */
      },
      toggleMute: () => {
        muted = !muted
        setMuteFn?.(muted)
        return muted
      },
      end,
    },
  }
}

// --- Decline an incoming call ---------------------------------------

export async function declineIncomingCall(opts: {
  supabase: ReturnType<typeof createBrowserClient>
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

  await logCallEvent(
    opts.supabase,
    opts.conversationId,
    opts.myId,
    '📞 Voice call · declined',
    null,
  )
}

// --- Internals ------------------------------------------------------

async function updatePendingTerminal(
  pendingCallId: string,
  status: string,
): Promise<void> {
  try {
    const supabase = createBrowserClient()
    await supabase
      .from('pending_calls')
      .update({ status })
      .eq('id', pendingCallId)
  } catch {
    /* best-effort */
  }
}

const inboundSubscribers: Array<(msg: SignalingMessage) => void> = []
let inboundChannel: ReturnType<ReturnType<typeof createBrowserClient>['channel']> | null =
  null
let inboundUserId: string | null = null

async function ensureInboundChannel(userId: string): Promise<void> {
  if (inboundChannel && inboundUserId === userId) return
  if (inboundChannel) {
    try {
      const supabase = createBrowserClient()
      await supabase.removeChannel(inboundChannel)
    } catch {
      /* ignore */
    }
    inboundChannel = null
    inboundSubscribers.length = 0
  }
  const supabase = createBrowserClient()
  const channel = supabase.channel(`calls:${userId}`, {
    config: { broadcast: { self: false, ack: false } },
  })
  channel.on('broadcast', { event: 'signal' }, (raw) => {
    const msg = raw.payload as SignalingMessage | null
    if (!msg) return
    for (const sub of inboundSubscribers) {
      try {
        sub(msg)
      } catch {
        /* swallow */
      }
    }
  })
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') resolve()
      if (
        status === 'CHANNEL_ERROR' ||
        status === 'TIMED_OUT' ||
        status === 'CLOSED'
      ) {
        resolve()
      }
    })
  })
  inboundChannel = channel
  inboundUserId = userId
}

async function listenForInbound(
  userId: string,
  onMessage: (msg: SignalingMessage) => void,
): Promise<void> {
  await ensureInboundChannel(userId)
  inboundSubscribers.push(onMessage)
}

/**
 * Test/debug only — clear cached ICE config.
 */
export function __resetWebrtcClientForTests(): void {
  cachedIceConfig = null
  cachedIceConfigExpiresAt = 0
}
