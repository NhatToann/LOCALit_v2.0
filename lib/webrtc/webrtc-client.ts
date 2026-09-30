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
import { getSignalingSupabase } from './signaling-supabase'

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

const DEBUG_CALL = process.env.NEXT_PUBLIC_CALL_DEBUG === '1'

/**
 * Per-target outbound channels — persistent for the lifetime of a
 * call. Holding the channel open (instead of creating-then-removing
 * on every send) is what lets Supabase Realtime broadcast actually
 * reach the peer: the realtime gateway only fans out broadcasts
 * between currently-subscribed members. Ephemeral channels that
 * subscribe → send → unsubscribe immediately are unreliable
 * (observed in repro 2026-09-30: caller sent 12 ICE candidates
 * successfully but the callee never received any of them).
 *
 * Cleanup: `releaseOutboundChannel(target)` is called from
 * finalize()/end() so the channel is removed exactly once when the
 * call terminates.
 */
const outboundChannels = new Map<
  string,
  ReturnType<ReturnType<typeof createBrowserClient>['channel']>
>()

async function acquireOutboundChannel(
  toUserId: string,
): Promise<ReturnType<ReturnType<typeof createBrowserClient>['channel']>> {
  const existing = outboundChannels.get(toUserId)
  if (existing) return existing
  const supabase = getSignalingSupabase()
  const channel = supabase.channel(`calls:${toUserId}`, {
    config: { broadcast: { self: false, ack: false } },
  })
  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (DEBUG_CALL) {
        // eslint-disable-next-line no-console
        console.log(
          '[dlog] acquireOutboundChannel subscribe',
          status,
          'channel',
          `calls:${toUserId}`,
        )
      }
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
  outboundChannels.set(toUserId, channel)
  return channel
}

async function releaseOutboundChannel(toUserId: string): Promise<void> {
  const channel = outboundChannels.get(toUserId)
  if (!channel) return
  outboundChannels.delete(toUserId)
  try {
    const supabase = getSignalingSupabase()
    await supabase.removeChannel(channel)
  } catch {
    /* ignore */
  }
}

/**
 * Send a signaling message to a peer.
 *
 * Why DB-backed instead of Supabase Realtime broadcast:
 *   Realtime broadcast was unreliable in production — the WebSocket
 *   kept falling back to REST long-polling (cookies don't carry the
 *   access_token in the upgrade request), and broadcast messages
 *   between peers were dropped silently. We now INSERT each message
 *   into `webrtc_signals` and let the recipient pick it up via
 *   postgres_changes INSERT events, which use the same Realtime
 *   connection that powers the IncomingCallWatcher popup reliably.
 *
 *   See supabase/migrations/2026-09-30-webrtc-signals.sql for the
 *   RLS + publication setup.
 */
async function sendSignaling(toUserId: string, msg: SignalingMessage): Promise<void> {
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] sendSignaling', msg.type, '→', toUserId, 'callId=', msg.callId)
  }
  const kind = msg.type
  if (kind === 'ring') {
    // 'ring' is only an in-protocol hint; no DB row needed.
    return
  }
  const supabase = getSignalingSupabase()
  const { error } = await supabase.from('webrtc_signals').insert({
    call_id: msg.callId,
    from_user_id: msg.from,
    to_user_id: msg.to,
    kind,
    payload: msg.sdp ?? msg.candidate ?? {},
  })
  if (error) {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] sendSignaling ERR', kind, error.message)
    }
    throw error
  }
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] sendSignaling sent OK', kind)
  }
}

/**
 * Test/debug only — clear cached outbound channels.
 */
export function __resetOutboundChannels(): void {
  outboundChannels.clear()
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
  /**
 * Diagnostic logging — gated behind `NEXT_PUBLIC_CALL_DEBUG=1` so it
 * stays out of normal user sessions but can be flipped on for a
 * reproduction test via Vercel env vars (no code change needed).
 */
pc.onicecandidate = (event) => {
    if (event.candidate) {
      hooks.onIceCandidate(event.candidate.toJSON())
      if (DEBUG_CALL) {
        // eslint-disable-next-line no-console
        console.log('[dlog] local ICE', event.candidate.candidate?.slice(0, 60))
      }
    }
  }

  pc.ontrack = (event) => {
    const [stream] = event.streams
    if (stream) hooks.onRemoteStream(stream)
  }

  pc.onconnectionstatechange = () => {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] pc.connectionState', pc.connectionState)
    }
    hooks.onConnectionStateChange(pc.connectionState)
  }

  pc.oniceconnectionstatechange = () => {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] pc.iceConnectionState', pc.iceConnectionState)
    }
  }

  pc.onicegatheringstatechange = () => {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] pc.iceGatheringState', pc.iceGatheringState)
    }
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
  const supabase = getSignalingSupabase()

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
    void (async () => {
      await releaseOutboundChannel(opts.peerId).catch(() => undefined)
    })()
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
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] acceptIncomingCall called', {
      callId: opts.pendingCallId,
      myId: opts.myId,
      peerId: opts.peerId,
    })
  }
  if (!opts.pendingCallId) {
    throw new Error('acceptIncomingCall requires pendingCallId')
  }
  const supabase = getSignalingSupabase()
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
    void releaseOutboundChannel(callerId)
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
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] acceptIncomingCall: about to getIceConfig + buildPeerConnection')
  }
  const iceConfig = await getIceConfig()
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] acceptIncomingCall: got ice config, building PC. iceServers=', JSON.stringify(iceConfig.iceServers))
  }
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
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] acceptIncomingCall: about to call listenForInbound for myId=', opts.myId)
  }
  void listenForInbound(opts.myId, async (msg) => {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] callee inbound received', msg.type, 'callId=', msg.callId, 'expect=', callId)
    }
    if (msg.callId !== callId) return
    if (msg.type === 'offer' && msg.sdp) {
      pendingRemoteOffer = msg.sdp
      if (DEBUG_CALL) {
        // eslint-disable-next-line no-console
        console.log('[dlog] callee inbound: setRemoteDescription starting', JSON.stringify(msg.sdp).slice(0, 80))
      }
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] callee inbound: setRemoteDescription OK, creating answer')
        }
        const answer = await pc.createAnswer()
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] callee inbound: createAnswer OK, setLocalDescription starting')
        }
        await pc.setLocalDescription(answer)
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] callee inbound: setLocalDescription OK, sending answer')
        }
        send({
          type: 'answer',
          callId,
          from: opts.myId,
          to: callerId,
          sdp: answer,
        })
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] callee inbound: answer sent')
        }
      } catch (err) {
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] callee inbound: ERR', (err as Error).message)
        }
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
    const supabase = getSignalingSupabase()
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
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] ensureInboundChannel', userId)
  }
  if (inboundChannel && inboundUserId === userId) {
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] ensureInboundChannel: reuse existing')
    }
    return
  }
  if (inboundChannel) {
    try {
      const supabase = getSignalingSupabase()
      await supabase.removeChannel(inboundChannel)
    } catch {
      /* ignore */
    }
    inboundChannel = null
    inboundSubscribers.length = 0
  }

  /**
   * Poll-based inbound delivery.
   *
   * Why polling instead of postgres_changes INSERT events:
   *   The realtime websocket kept falling back to REST long-polling
   *   (cookies don't carry the access_token in the WS upgrade), so
   *   postgres_changes events silently never arrived. Polling hits
   *   the REST endpoint, which DOES carry the auth cookie reliably.
   *
   *   Latency cost: 500 ms cadence. Acceptable for WebRTC signaling
   *   where ICE candidates arrive in bursts at the start of the call
   *   and the actual SDP offer/answer is the only one that has to
   *   land within ~1 s of Accept. We belt-and-suspenders this by
   *   also opening the postgres_changes channel — if realtime WS
   *   happens to work for a given client, we deliver faster; if not,
   *   polling still gets the message through.
   */
  const supabase = getSignalingSupabase()
  const channel = supabase.channel(`webrtc-signals:${userId}`)

  let lastSeenAt = new Date(Date.now() - 5_000).toISOString()
  let stop = false

  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] ensureInboundChannel lastSeenAt initial=', lastSeenAt)
  }

  async function pollOnce(): Promise<void> {
    if (stop) return
    try {
      const supabase = getSignalingSupabase()
      const { data, error } = await supabase
        .from('webrtc_signals')
        .select('id, call_id, from_user_id, to_user_id, kind, payload, created_at')
        .eq('to_user_id', userId)
        .gt('created_at', lastSeenAt)
        .order('created_at', { ascending: true })
        .limit(50)
      if (DEBUG_CALL) {
        // eslint-disable-next-line no-console
        console.log(
          '[dlog] inbound poll',
          error ? `ERR ${error.message}` : `recv ${(data ?? []).length} rows`,
          `lastSeen=${lastSeenAt}`,
          `subs=${inboundSubscribers.length}`,
        )
      }
      if (error) {
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] inbound poll ERR', error.message)
        }
        return
      }
      if (!data || data.length === 0) return
      for (const row of data) {
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] inbound poll recv', row.kind, 'callId=', row.call_id)
        }
        lastSeenAt = row.created_at
        if (
          row.kind !== 'offer' &&
          row.kind !== 'answer' &&
          row.kind !== 'ice-candidate' &&
          row.kind !== 'bye'
        ) {
          continue
        }
        // payload for offer/answer/bye is the full SessionDescriptionInit
        // object ({type, sdp}) or null; payload for ice-candidate is the
        // RTCIceCandidateInit ({candidate, sdpMid, ...}). The signaling
        // message shape matches the inner payload verbatim — the caller
        // constructs msg with `sdp: offer` (the whole object) and we
        // round-trip it through jsonb.
        const msg: SignalingMessage = {
          type: row.kind,
          callId: row.call_id,
          from: row.from_user_id,
          to: row.to_user_id,
          sdp:
            row.kind === 'offer' || row.kind === 'answer'
              ? (row.payload as unknown as RTCSessionDescriptionInit | null) ?? undefined
              : undefined,
          candidate:
            row.kind === 'ice-candidate'
              ? (row.payload as unknown as RTCIceCandidateInit | null) ?? undefined
              : undefined,
        }
        for (const sub of inboundSubscribers) {
          try {
            sub(msg)
          } catch {
            /* swallow */
          }
        }
        try {
          await supabase.from('webrtc_signals').delete().eq('id', row.id)
        } catch {
          /* ignore */
        }
      }
    } catch {
      /* swallow */
    }
  }

  // Try postgres_changes first — if it works, great. Otherwise
  // polling covers it.
  channel.on(
    'postgres_changes',
    {
      event: 'INSERT',
      schema: 'public',
      table: 'webrtc_signals',
      filter: `to_user_id=eq.${userId}`,
    },
    async (payload) => {
      const row = payload.new as {
        id: string
        call_id: string
        from_user_id: string
        to_user_id: string
        kind: string
        payload: unknown
        created_at: string
      }
      if (DEBUG_CALL) {
        // eslint-disable-next-line no-console
        console.log('[dlog] inboundChannel recv (postgres_changes)', row.kind, 'callId=', row.call_id)
      }
      if (
        row.kind !== 'offer' &&
        row.kind !== 'answer' &&
        row.kind !== 'ice-candidate' &&
        row.kind !== 'bye'
      ) {
        return
      }
      const msg: SignalingMessage = {
        type: row.kind as SignalingMessage['type'],
        callId: row.call_id,
        from: row.from_user_id,
        to: row.to_user_id,
        sdp:
          row.kind === 'offer' || row.kind === 'answer'
            ? (row.payload as unknown as RTCSessionDescriptionInit | null) ?? undefined
            : undefined,
        candidate:
          row.kind === 'ice-candidate'
            ? (row.payload as unknown as RTCIceCandidateInit | null) ?? undefined
            : undefined,
      }
      for (const sub of inboundSubscribers) {
        try {
          sub(msg)
        } catch {
          /* swallow */
        }
      }
      try {
        await supabase.from('webrtc_signals').delete().eq('id', row.id)
      } catch {
        /* ignore */
      }
    },
  )

  await new Promise<void>((resolve) => {
    channel.subscribe((status) => {
      if (DEBUG_CALL) {
        // eslint-disable-next-line no-console
        console.log(
          '[dlog] ensureInboundChannel subscribe',
          status,
          'channel',
          `webrtc-signals:${userId}`,
        )
      }
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

  // Start the polling fallback. Even if realtime events arrive,
  // polling also catches any rows the realtime path missed (e.g.
  // during a transient WS reconnect).
  if (DEBUG_CALL) {
    // eslint-disable-next-line no-console
    console.log('[dlog] ensureInboundChannel: starting poller for', userId)
  }
  void (async () => {
    let ticks = 0
    while (!stop) {
      await new Promise((r) => setTimeout(r, 500))
      ticks++
      try {
        await pollOnce()
      } catch (e) {
        if (DEBUG_CALL) {
          // eslint-disable-next-line no-console
          console.log('[dlog] inbound poll loop ERR', (e as Error).message)
        }
      }
      if (DEBUG_CALL && ticks === 3) {
        // eslint-disable-next-line no-console
        console.log('[dlog] poll loop alive after 3 ticks')
      }
    }
    if (DEBUG_CALL) {
      // eslint-disable-next-line no-console
      console.log('[dlog] poll loop stopped for', userId)
    }
  })()

  // Patch the channel so removing it stops the poller too.
  const origRemove = channel.unsubscribe.bind(channel)
  channel.unsubscribe = ((...args: unknown[]) => {
    stop = true
    return (origRemove as (...a: unknown[]) => Promise<unknown>)(...args)
  }) as typeof channel.unsubscribe
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
