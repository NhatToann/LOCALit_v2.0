/**
 * LiveKit-based voice-call client.
 *
 * Replaces the prior self-hosted RTCPeerConnection + Supabase Realtime
 * signaling path. LiveKit's @livekit/components-react SDK handles SDP,
 * ICE, TURN, codec negotiation, and reconnects — leaving this module
 * to focus on:
 *
 *   1. Token acquisition from /api/livekit/token
 *   2. Room connect + publish the local mic track
 *   3. Surface a small imperative API the chat page can drive
 *   4. Track call state (calling/connecting/connected/ended/failed)
 *
 * Why this exists as a class:
 *   The chat page owns the call lifecycle (start/accept/end) and
 *   needs a synchronous-feeling API that returns a CallClient object.
 *   LiveKit's Room.connect() is async; we wrap it.
 */

import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  AudioPresets,
} from 'livekit-client'

export type CallState =
  | 'idle'
  | 'calling'
  | 'ringing'
  | 'connecting'
  | 'connected'
  | 'declined'
  | 'missed'
  | 'ended'
  | 'failed'

export interface LiveKitCallOptions {
  myId: string
  /** Stable room id, e.g. `call:<conversationId>`. */
  roomName: string
  /** Display name shown to peers inside the LiveKit room. */
  participantName?: string
  onState: (s: CallState) => void
  onRemoteStream: (stream: MediaStream) => void
  onLocalStream: (stream: MediaStream) => void
  onError?: (err: Error) => void
}

export interface LiveKitCallClient {
  readonly callId: string
  /** Publish the local mic — must be called after user gesture / mic permission. */
  publishMic(): Promise<void>
  /** End the call and release all resources. */
  end(): void
  /** Toggle the published mic's mute state. Returns the new mute state. */
  toggleMute(): boolean
  /** No-op for voice calls: decline is just `end()`. Kept for parity
   *  with the prior CallClient interface used by CallModal. */
  decline(): void
}

const TOKEN_ENDPOINT = '/api/livekit/token'

async function fetchToken(roomName: string, participantName: string): Promise<{
  token: string
  wsUrl: string
  identity: string
}> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ roomName, participantName }),
    credentials: 'same-origin',
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(
      `LiveKit token request failed: ${res.status} ${body.slice(0, 200)}`,
    )
  }
  const body = (await res.json()) as {
    token: string
    wsUrl: string
    identity: string
  }
  if (!body.token || !body.wsUrl) {
    throw new Error('LiveKit token response missing token or wsUrl')
  }
  return body
}

async function getMicStream(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Error('Microphone API unavailable in this environment')
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: false,
  })
}

export async function startLiveKitCall(
  opts: LiveKitCallOptions,
): Promise<LiveKitCallClient> {
  const callId = `${opts.roomName}:${Date.now()}`
  const { token, wsUrl } = await fetchToken(
    opts.roomName,
    opts.participantName ?? '',
  )

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      audioPreset: AudioPresets.speech,
    },
  })

  let localStream: MediaStream | null = null
  let published = false
  let ended = false
  let muted = false

  function dispose() {
    if (ended) return
    ended = true
    try {
      room.disconnect()
    } catch {
      /* ignore */
    }
    if (localStream) {
      for (const t of localStream.getTracks()) {
        try {
          t.stop()
        } catch {
          /* ignore */
        }
      }
      localStream = null
    }
  }

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    if (state === ConnectionState.Connecting) {
      opts.onState('connecting')
    } else if (state === ConnectionState.Connected) {
      opts.onState('connected')
    } else if (
      state === ConnectionState.Disconnected
    ) {
      if (!ended) {
        opts.onError?.(new Error(`LiveKit disconnected: ${state}`))
        opts.onState('ended')
        dispose()
      }
    }
  })

  room.on(
    RoomEvent.TrackSubscribed,
    (track, _pub, _participant) => {
      if (track.kind === Track.Kind.Audio) {
        const stream = new MediaStream([track.mediaStreamTrack])
        opts.onRemoteStream(stream)
      }
    },
  )

  await room.connect(wsUrl, token)
  // Local stream is published separately by publishMic() after the
  // user has confirmed mic permission — we never grab the mic in the
  // background.

  return {
    callId,
    async publishMic() {
      if (published || ended) return
      localStream = await getMicStream()
      opts.onLocalStream(localStream)
      await room.localParticipant.publishTrack(localStream.getAudioTracks()[0], {
        name: 'mic',
      })
      published = true
      // If the room already has peers (we joined second), nudge the
      // state to connected — the room's own Connected state fires
      // before publishMic runs, but the UI expects connected after
      // the user has accepted mic permission.
      if (room.state === ConnectionState.Connected) {
        opts.onState('connected')
      }
    },
    end() {
      opts.onState('ended')
      dispose()
    },
    toggleMute() {
      muted = !muted
      for (const pub of room.localParticipant.trackPublications.values()) {
        if (pub.track?.kind === Track.Kind.Audio) {
          const track = pub.track
          if (muted) {
            void track.mute()
          } else {
            void track.unmute()
          }
        }
      }
      return muted
    },
    decline() {
      opts.onState('declined')
      dispose()
    },
  }
}
