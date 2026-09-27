import { getIceConfig } from './ice-config'
import { createClient } from '@/utils/supabase/auth'

/**
 * High-level WebRTC call controller.
 *
 *   const call = new CallClient({
 *     callLogId, myId, peerId, myName, peerName, mode: 'voice'|'video', isCallee
 *   })
 *   await call.start()
 *   ...call.onLocalStream / onRemoteStream / onStateChange
 *   call.end()
 *
 * Signaling: Postgres-backed via `call_signals` table (server-side messages
 * stored as rows and read by the peer via Realtime).
 *
 * The caller creates a `call_logs` row first, then both peers post signals
 * to `call_signals` with the same `call_log_id`. Either side may delete its
 * own signals after consuming them.
 */
export type CallMode = 'voice' | 'video'

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'ended'
  | 'failed'
  | 'declined'
  | 'missed'

export interface CallClientOpts {
  callLogId: string
  conversationId: string
  myId: string
  peerId: string
  myName: string
  peerName: string
  mode: CallMode
  isCallee: boolean
  onLocalStream?: (stream: MediaStream) => void
  onRemoteStream?: (stream: MediaStream) => void
  onState?: (state: CallState) => void
  onError?: (err: Error) => void
}

const ICE_GATHER_TIMEOUT = 8000

export class CallClient {
  private pc: RTCPeerConnection | null = null
  private localStream: MediaStream | null = null
  private remoteStream: MediaStream | null = null
  private opts: CallClientOpts
  private channel: any = null
  private state: CallState = 'idle'
  private processedSignalIds = new Set<string>()

  constructor(opts: CallClientOpts) {
    this.opts = opts
  }

  private setState(s: CallState) {
    this.state = s
    this.opts.onState?.(s)
  }

  async start() {
    try {
      const ice = await getIceConfig()
      this.pc = new RTCPeerConnection({ iceServers: ice.iceServers })

      // Local media
      this.localStream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: this.opts.mode === 'video',
      })
      this.localStream.getTracks().forEach((t) => this.pc!.addTrack(t, this.localStream!))
      this.opts.onLocalStream?.(this.localStream)

      // Remote stream
      this.remoteStream = new MediaStream()
      this.pc.ontrack = (ev) => {
        ev.streams[0]?.getTracks().forEach((t) => this.remoteStream!.addTrack(t))
        if (this.remoteStream) this.opts.onRemoteStream?.(this.remoteStream)
      }

      this.pc.oniceconnectionstatechange = () => {
        if (this.pc?.iceConnectionState === 'connected' || this.pc?.iceConnectionState === 'completed') {
          this.setState('connected')
        } else if (this.pc?.iceConnectionState === 'failed') {
          this.setState('failed')
        }
      }

      await this.subscribeSignals()

      if (this.opts.isCallee) {
        // Caller has already created the offer; we'll see it in our signal
        // subscription. State shows ringing.
        this.setState('ringing')
      } else {
        // Caller side: create offer
        this.setState('calling')
        const offer = await this.pc.createOffer()
        await this.pc.setLocalDescription(offer)
        await this.sendSignal('offer', { sdp: offer.sdp, type: offer.type })
      }
    } catch (e) {
      this.setState('failed')
      this.opts.onError?.(e as Error)
      await this.end()
    }
  }

  private async subscribeSignals() {
    const supabase = createClient()
    this.channel = supabase
      .channel(`call-${this.opts.callLogId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'call_signals',
          filter: `call_log_id=eq.${this.opts.callLogId}`,
        },
        async (payload) => {
          const sig = payload.new as any
          if (sig.sender_id === this.opts.myId) return
          if (this.processedSignalIds.has(sig.id)) return
          this.processedSignalIds.add(sig.id)
          try {
            await this.handleSignal(sig)
            // Best-effort cleanup of consumed signal
            await supabase.from('call_signals').delete().eq('id', sig.id)
          } catch (e) {
            console.warn('signal handle failed', e)
          }
        },
      )
      .subscribe()
  }

  private async handleSignal(sig: any) {
    if (!this.pc) return
    if (sig.signal_type === 'offer') {
      this.setState('connecting')
      await this.pc.setRemoteDescription({ type: sig.payload.type, sdp: sig.payload.sdp })
      const answer = await this.pc.createAnswer()
      await this.pc.setLocalDescription(answer)
      await this.sendSignal('answer', { sdp: answer.sdp, type: answer.type })
    } else if (sig.signal_type === 'answer') {
      await this.pc.setRemoteDescription({ type: sig.payload.type, sdp: sig.payload.sdp })
      this.setState('connected')
    } else if (sig.signal_type === 'ice') {
      try {
        await this.pc.addIceCandidate(sig.payload as RTCIceCandidateInit)
      } catch (e) {
        // Candidates can race — ignore first errors.
      }
    } else if (sig.signal_type === 'bye') {
      this.setState('ended')
      await this.end()
    } else if (sig.signal_type === 'busy') {
      this.setState('declined')
      await this.end()
    }

    // Trickle ICE
    if (this.pc) {
      this.pc.onicecandidate = async (ev) => {
        if (ev.candidate) {
          await this.sendSignal('ice', ev.candidate.toJSON())
        }
      }
    }
  }

  private async sendSignal(signal_type: string, payload: Record<string, unknown> | RTCIceCandidateInit) {
    const supabase = createClient()
    await supabase.from('call_signals').insert({
      call_log_id: this.opts.callLogId,
      sender_id: this.opts.myId,
      recipient_id: this.opts.peerId,
      signal_type,
      payload: payload as Record<string, unknown>,
    })
  }

  async accept() {
    if (!this.opts.isCallee) return
    this.setState('connecting')
    // Caller already sent offer; we just need to start ICE gathering.
    // (handled in handleSignal above)
  }

  async decline() {
    this.setState('declined')
    await this.sendSignal('busy', {})
    await this.markLogStatus('declined')
    await this.end()
  }

  async end() {
    try {
      this.localStream?.getTracks().forEach((t) => t.stop())
      this.pc?.close()
      if (this.channel) {
        const supabase = createClient()
        await supabase.removeChannel(this.channel)
        this.channel = null
      }
      if (this.state !== 'ended' && this.state !== 'declined' && this.state !== 'missed') {
        await this.sendSignal('bye', {})
      }
      await this.markLogStatus(this.state === 'failed' ? 'failed' : 'ended')
    } catch {
      /* swallow */
    }
    this.setState('ended')
  }

  private async markLogStatus(status: string) {
    const supabase = createClient()
    const updates: any = { status }
    if (status === 'ended') {
      updates.ended_at = new Date().toISOString()
    }
    await supabase.from('call_logs').update(updates).eq('id', this.opts.callLogId)
  }

  toggleMute(): boolean {
    if (!this.localStream) return false
    const track = this.localStream.getAudioTracks()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return !track.enabled
  }

  toggleCamera(): boolean {
    if (!this.localStream) return false
    const track = this.localStream.getVideoTracks()[0]
    if (!track) return false
    track.enabled = !track.enabled
    return !track.enabled
  }
}

/**
 * Initiate a call as the caller. Returns the CallClient and call log id.
 */
export async function startOutgoingCall(opts: Omit<CallClientOpts, 'callLogId' | 'isCallee'>) {
  const supabase = createClient()
  const { data: log, error } = await supabase
    .from('call_logs')
    .insert({
      conversation_id: opts.conversationId,
      caller_id: opts.myId,
      callee_id: opts.peerId,
      call_type: opts.mode,
      status: 'initiated',
    })
    .select('id')
    .single()
  if (error || !log) throw new Error(error?.message ?? 'Could not create call log')

  const client = new CallClient({
    ...opts,
    callLogId: log.id,
    isCallee: false,
  })
  await client.start()
  return { client, callLogId: log.id }
}

/**
 * Listen for incoming calls targeted at this user. When one arrives, returns
 * a CallClient the callee can accept or decline.
 */
export function watchForIncomingCalls(
  myId: string,
  onIncoming: (log: any, client: CallClient) => void,
) {
  const supabase = createClient()
  const channel = supabase
    .channel(`incoming-calls-${myId}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'call_logs',
      },
      async (payload) => {
        const log = payload.new as any
        if (log.callee_id !== myId) return
        if (log.status !== 'initiated') return
        // Build the client; callee side starts in ringing state and waits
        // for an 'offer' signal.
        const client = new CallClient({
          callLogId: log.id,
          conversationId: log.conversation_id,
          myId,
          peerId: log.caller_id,
          myName: '',
          peerName: '',
          mode: log.call_type,
          isCallee: true,
        })
        onIncoming(log, client)
      },
    )
    .subscribe()
  return () => {
    supabase.removeChannel(channel)
  }
}
