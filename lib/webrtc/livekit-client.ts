/**
 * LiveKit-based voice + video call client.
 *
 * Replaces the prior self-hosted RTCPeerConnection + Supabase Realtime
 * signaling path. LiveKit's SDK handles SDP, ICE, TURN, codec
 * negotiation, and reconnects — leaving this module to focus on:
 *
 *   1. Token acquisition from /api/livekit/token
 *   2. Room connect + publish the local mic track (and optional camera)
 *   3. Surface a small imperative API the chat page can drive
 *   4. Track call state (calling/connecting/connected/ended/failed)
 *
 * Why this exists as a class:
 *   The chat page owns the call lifecycle (start/accept/end) and
 *   needs a synchronous-feeling API that returns a CallClient object.
 *   LiveKit's Room.connect() is async; we wrap it.
 *
 * Voice vs video (2026-10-01):
 *   The same `startLiveKitCall` factory is used for both voice and
 *   video calls. Pass `video: true` to publish the camera as well.
 *   `pending_calls.type` (DB) carries the same flag; the call UI
 *   picks the modal accordingly. CallModal stays voice-only;
 *   VideoCallModal renders the video tiles.
 */

import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  AudioPresets,
  VideoPresets,
  type LocalAudioTrack,
  type LocalVideoTrack,
  type RemoteAudioTrack,
  type RemoteVideoTrack,
  type RemoteParticipant,
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

export type CallMode = 'voice' | 'video'

// Set to '1' to enable LiveKit client debug logging in the browser
// console (prefix [dlog:lk]). Off by default — the logs print on
// every state transition and would otherwise be too noisy.
const DEBUG_LIVEKIT =
  typeof process !== 'undefined' &&
  process.env.NEXT_PUBLIC_CALL_DEBUG === '1'

export interface LiveKitCallOptions {
  myId: string
  /** Stable room id, e.g. `call:<conversationId>`. */
  roomName: string
  /** Display name shown to peers inside the LiveKit room. */
  participantName?: string
  /**
   * When true, the camera will be requested and published in
   * addition to the microphone. Defaults to false (voice-only —
   * matches the historical behavior, safe for call-button paths
   * that haven't been updated for video yet).
   */
  video?: boolean
  onState: (s: CallState) => void
  onRemoteStream: (stream: MediaStream) => void
  onLocalStream: (stream: MediaStream) => void
  /**
   * Fired when a remote VIDEO track subscribes (video calls only).
   * The element argument is auto-created by LiveKit; we hand it to
   * the caller so they can mount it inside their <video> container.
   */
  onRemoteVideoTrack?: (track: RemoteVideoTrack) => void
  /**
   * Fired when the local video track is published (or updated). The
   * caller attaches it to a self-view <video> element.
   */
  onLocalVideoTrack?: (track: LocalVideoTrack) => void
  onError?: (err: Error) => void
}

export interface LiveKitCallClient {
  readonly callId: string
  readonly mode: CallMode
  /**
   * Publish the local mic — must be called after user gesture / mic
   * permission. If the call was started with `video: true`, also
   * publishes the camera track.
   */
  publishMic(): Promise<void>
  /** End the call and release all resources. */
  end(): void
  /** Toggle the published mic's mute state. Returns the new mute state. */
  toggleMute(): boolean
  /** Toggle the published camera's enabled state. Returns the new state. */
  toggleCamera(): boolean
  /**
   * Switch between front-facing and back-facing cameras. No-op on
   * desktop (only one camera typically present) and on browsers that
   * don't expose `getCapabilities()`.
   */
  switchCamera(): Promise<'user' | 'environment' | 'unsupported'>
  /**
   * Attach the remote + local video tracks to the supplied HTML
   * video elements. Used by ActiveCallSheet when the call survives
   * a page navigation (the chat-page-owned <video> refs get
   * unmounted, and the global sheet needs to take over). No-op for
   * voice calls.
   */
  attachVideoElements(opts: {
    remote?: HTMLVideoElement | null
    self?: HTMLVideoElement | null
  }): void
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

/**
 * Get a combined mic + camera stream. Browsers issue ONE permission
 * prompt when both audio + video are requested together, which is
 * why we always pass `video` based on the call mode — we don't ask
 * for mic, then ask for camera, then merge them.
 */
async function getLocalStream(video: boolean): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    throw new Error('Camera/microphone API unavailable in this environment')
  }
  return await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
    video: video
      ? {
          facingMode: 'user',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 24 },
        }
      : false,
  })
}

export async function startLiveKitCall(
  opts: LiveKitCallOptions,
): Promise<LiveKitCallClient> {
  const callId = `${opts.roomName}:${Date.now()}`
  const mode: CallMode = opts.video ? 'video' : 'voice'
  // (2026-10-02 hardening) The whole call hangs forever if `room.connect`
  // never returns and ConnectionStateChanged: Connected never fires
  // (e.g. LiveKit server outage, WebSocket blocked, DNS hang). We
  // race the connect against a 15s timeout — whichever wins — so the
  // chat page can surface 'failed' rather than sitting on
  // 'Connecting…' indefinitely.
  const CONNECT_TIMEOUT_MS = 15_000
  const { token, wsUrl } = await fetchToken(
    opts.roomName,
    opts.participantName ?? '',
  )

  const room = new Room({
    adaptiveStream: true,
    dynacast: true,
    publishDefaults: {
      audioPreset: AudioPresets.speech,
      videoCodec: 'vp8',
    },
    videoCaptureDefaults: {
      resolution: VideoPresets.h720.resolution,
    },
  })

  let localStream: MediaStream | null = null
  let published = false
  let muted = false
  let cameraOn = true
  let currentFacing: 'user' | 'environment' = 'user'

  // Resource cleanup is independent of the "should we emit 'ended' to
  // the UI?" question. Disposing twice is fine (we no-op), but
  // deciding to emit 'ended' is idempotent — if any path has fired
  // it, the others must defer.
  let disposed = false
  function dispose() {
    if (disposed) return
    disposed = true
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

  // `ended` is the "we have emitted 'ended' to the UI, don't do it
  // again" sentinel. `disposed` is the "we have released tracks and
  // disconnected from LiveKit" sentinel. They are different.
  let ended = false
  function emitEnded(reason: 'ended' | 'failed', errorMessage?: string) {
    if (ended) return
    ended = true
    opts.onState(reason)
    if (errorMessage) opts.onError?.(new Error(errorMessage))
    dispose()
  }

  // Track the conditions required for "both peers are live":
  //   - the local LiveKit room has reached Connected state
  //   - at least one remote participant has joined
  // The headline timer (00:00) starts ONLY when BOTH are true.
  //
  // Why we don't require a remote TRACK (2026-10-02 bug): if either
  // side denies mic permission, `publishMic()` aborts and never
  // publishes a track. The other side's TrackSubscribed event then
  // never fires, which means the call would sit on "Connecting…"
  // forever — the user reported this exact symptom on 2026-10-02.
  // The call is "live" the moment both peers are in the LiveKit
  // room, regardless of whether the mic track is published yet; the
  // chat page will surface the mic-denied state separately if it
  // happens.
  let localConnected = false
  let hasRemoteParticipant = false
  // (2026-10-02 fix) Once we've emitted 'connected', LiveKit may
  // transition the Room back through Connecting/Disconnected as part
  // of its automatic reconnect flow when the remote peer drops. We
  // need to ignore those noise transitions and only emit terminal
  // state changes (ended / failed / declined / missed) when they're
  // meaningful. See the ConnectionStateChanged + ParticipantDisconnected
  // handlers below for how this flag short-circuits them.
  let hasEmittedConnected = false
  const debugLog = (...args: unknown[]) => {
    if (DEBUG_LIVEKIT) {
      // eslint-disable-next-line no-console
      console.log('[dlog:lk]', ...args)
    }
  }
  const maybeFireConnected = () => {
    debugLog('maybeFireConnected', { localConnected, hasRemoteParticipant })
    if (localConnected && hasRemoteParticipant) {
      debugLog('→ FIRE connected')
      hasEmittedConnected = true
      opts.onState('connected')
    }
  }

  room.on(RoomEvent.ConnectionStateChanged, (state) => {
    debugLog('ConnectionStateChanged', state, 'localConnected?', localConnected, 'remote.size', room.remoteParticipants.size)
    if (state === ConnectionState.Connecting) {
      // (2026-10-02 bug fix) We only forward 'connecting' BEFORE the
      // call has reached the connected state. After 'connected' has fired
      // once, LiveKit's Room transitions to Connecting/Disconnected
      // can fire spuriously as part of automatic reconnect attempts
      // when the remote peer drops mid-call — and surfacing 'connecting'
      // to the UI at that point would re-wind the call to the
      // "Connecting…" frame and erase the active call timer. We let
      // ParticipantDisconnected / RoomEvent.Disconnected-with-ended
      // own the post-connected termination path; the connecting
      // state is a one-shot pre-connected signal.
      if (!localConnected) {
        opts.onState('connecting')
      } else {
        debugLog('ConnectionStateChanged→Connecting ignored (post-connected)')
      }
    } else if (state === ConnectionState.Connected) {
      localConnected = true
      // If a remote participant was already in the room when we
      // connected (we joined second), this branch handles the flip.
      if (room.remoteParticipants.size > 0) {
        hasRemoteParticipant = true
        debugLog('connected+remote-already-here: setting hasRemoteParticipant')
      }
      maybeFireConnected()
    } else if (state === ConnectionState.Disconnected) {
      // (2026-10-02 fix) If we had already reached connected, the
      // Disconnected state is almost certainly the OTHER side
      // dropping — ParticipantDisconnected will fire (or already
      // fired) and own the 'ended' emission. Suppressing this branch
      // post-connected also avoids the spurious 'connecting' bounce
      // we saw in the user's trace (ConnectionStateChanged fired
      // connecting → connected → disconnected in <1s after the caller
      // hung up, and the receiver's timer snapped from "Connected"
      // to "Connecting" because of it).
      if (ended) {
        // Already terminated by another path; nothing to do.
        return
      }
      if (hasEmittedConnected) {
        // Connected-then-disconnected: clean hangup by the remote
        // peer. ParticipantDisconnected owns the 'ended' emission;
        // we only release resources here.
        debugLog('ConnectionStateChanged→Disconnected (post-connected), deferring to ParticipantDisconnected')
        dispose()
      } else {
        // Disconnected before we ever reached connected. This is the
        // "connect failed" or "network dropped during handshake" case.
        debugLog('ConnectionStateChanged→Disconnected (unclean, pre-connect), ending')
        emitEnded('failed', `LiveKit disconnected: ${state}`)
      }
    }
  })

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    debugLog('ParticipantConnected', participant.identity)
    hasRemoteParticipant = true
    maybeFireConnected()
  })

  // (2026-10-02 fix) When the remote peer ends the call cleanly
  // (LiveKit room disconnect), the other side sees
  // ParticipantDisconnected. Mirror that to onState('ended') so
  // the survivor's modal collapses to the 'Call ended' frame in
  // sync — without this, the survivor kept ticking the duration
  // timer indefinitely even though the call was over.
  //
  // emitEnded is idempotent: if ConnectionStateChanged: Disconnected
  // (post-connect) already disposed the resources, this still fires
  // the UI emission exactly once.
  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    debugLog('ParticipantDisconnected', participant.identity)
    emitEnded('ended')
  })

  room.on(
    RoomEvent.TrackSubscribed,
    (track, _pub: RemoteTrackPublication, _participant: RemoteParticipant) => {
      // We still want to surface the remote media stream to the UI, but
      // we DO NOT gate the headline timer on this event — see comment
      // above about mic-denied edge cases.
      if (track.kind === Track.Kind.Audio) {
        const remote = track as RemoteAudioTrack
        const stream = new MediaStream([remote.mediaStreamTrack])
        opts.onRemoteStream(stream)
      } else if (track.kind === Track.Kind.Video) {
        const remote = track as RemoteVideoTrack
        opts.onRemoteVideoTrack?.(remote)
      }
    },
  )

  // Race the connect against a 15s timeout so a hung LiveKit server
  // doesn't trap the user on 'Connecting…' forever. On timeout we
  // surface 'failed' and let the chat page tear down the call.
  let connectTimer: ReturnType<typeof setTimeout> | null = null
  const connectPromise = room.connect(wsUrl, token).catch((err) => {
    if (connectTimer) clearTimeout(connectTimer)
    throw err
  })
  const timeoutPromise = new Promise<never>((_, reject) => {
    connectTimer = setTimeout(() => {
      reject(new Error(`LiveKit connect timed out after ${CONNECT_TIMEOUT_MS}ms`))
    }, CONNECT_TIMEOUT_MS)
  })
  try {
    await Promise.race([connectPromise, timeoutPromise])
  } finally {
    if (connectTimer) clearTimeout(connectTimer)
  }
  // Local stream is published separately by publishMic() after the
  // user has confirmed camera/mic permission — we never grab the
  // camera/mic in the background.

  return {
    callId,
    mode,
    async publishMic() {
      if (published || ended) return
      localStream = await getLocalStream(mode === 'video')
      opts.onLocalStream(localStream)
      // Publish audio
      const audioTrack = localStream.getAudioTracks()[0]
      if (audioTrack) {
        await room.localParticipant.publishTrack(audioTrack, {
          name: 'mic',
        })
      }
      // Publish video (if requested and present in the stream)
      if (mode === 'video') {
        const videoTrack = localStream.getVideoTracks()[0]
        if (videoTrack) {
          const pub = await room.localParticipant.publishTrack(videoTrack, {
            name: 'camera',
            source: Track.Source.Camera,
          })
          // Surface the LocalVideoTrack so the UI can attach it to a
          // self-view <video> element via track.attach().
          const localVideo = pub.track as LocalVideoTrack | undefined
          if (localVideo) opts.onLocalVideoTrack?.(localVideo)
        }
      }
      published = true
      // If the room is already connected AND the remote peer has
      // already joined, the ConnectionStateChanged / ParticipantConnected
      // handlers have already fired 'connected'. But there's a race
      // where we joined second AND the remote was already in the room
      // waiting when we connected: in that case we may not have
      // received a fresh ParticipantConnected event for the pre-existing
      // remote. Run maybeFireConnected() to cover that race.
      if (room.state === ConnectionState.Connected) {
        localConnected = true
        if (room.remoteParticipants.size > 0) hasRemoteParticipant = true
        maybeFireConnected()
      }
    },
    end() {
      // Use emitEnded so the 'ended' UI emission is idempotent with
      // the post-disconnect ConnectionStateChanged path — the latter
      // may also try to clean up resources but must NOT double-fire
      // 'ended' to the chat page (which would clear callState in
      // the middle of the activeCallStore.reset cycle).
      emitEnded('ended')
    },
    toggleMute() {
      muted = !muted
      for (const pub of room.localParticipant.trackPublications.values()) {
        if (pub.track?.kind === Track.Kind.Audio) {
          const track = pub.track as LocalAudioTrack
          if (muted) {
            void track.mute()
          } else {
            void track.unmute()
          }
        }
      }
      return muted
    },
    toggleCamera() {
      if (mode !== 'video') return false
      cameraOn = !cameraOn
      for (const pub of room.localParticipant.trackPublications.values()) {
        if (pub.track?.kind === Track.Kind.Video) {
          const track = pub.track as LocalVideoTrack
          if (cameraOn) {
            void track.unmute()
          } else {
            void track.mute()
          }
        }
      }
      return cameraOn
    },
    async switchCamera(): Promise<'user' | 'environment' | 'unsupported'> {
      if (mode !== 'video') return 'unsupported'
      const track = localStream?.getVideoTracks()[0]
      if (!track) return 'unsupported'
      const caps = (track.getCapabilities?.() ?? {}) as {
        facingMode?: string[]
      }
      if (!caps.facingMode || caps.facingMode.length < 2) {
        return 'unsupported'
      }
      currentFacing = currentFacing === 'user' ? 'environment' : 'user'
      try {
        await track.applyConstraints({ facingMode: currentFacing })
        return currentFacing
      } catch {
        // Roll back if the constraint can't be satisfied (e.g. device
        // only has the requested camera disabled).
        currentFacing = currentFacing === 'user' ? 'environment' : 'user'
        return 'unsupported'
      }
    },
    attachVideoElements(opts: {
      remote?: HTMLVideoElement | null
      self?: HTMLVideoElement | null
    }) {
      if (mode !== 'video') return
      // Local camera — pull the live track from the room and attach.
      const camPub = room.localParticipant.getTrackPublication(
        Track.Source.Camera,
      )
      const camTrack = camPub?.track as LocalVideoTrack | undefined
      if (camTrack && opts.self) {
        camTrack.attach(opts.self)
      }
      // Remote video — find the first remote participant and attach
      // their camera track. LiveKit supports multiple remotes; for
      // a 1:1 call there's only one.
      const remote = Array.from(room.remoteParticipants.values())[0] as
        | RemoteParticipant
        | undefined
      if (remote && opts.remote) {
        const remoteCamPub = remote.getTrackPublication(Track.Source.Camera)
        const remoteTrack = remoteCamPub?.track as
          | RemoteVideoTrack
          | undefined
        if (remoteTrack) remoteTrack.attach(opts.remote)
      }
    },
    decline() {
      opts.onState('declined')
      dispose()
    },
  }
}

/** Re-export the RemoteTrackPublication type for downstream code that
 *  wants to wire additional event handlers (we keep the import local
 *  in this module to avoid forcing consumers to know about it). */
type RemoteTrackPublication = import('livekit-client').RemoteTrackPublication
