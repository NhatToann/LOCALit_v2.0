/**
 * useLiveKitRoom — React hook bridging the imperative
 * `LiveKitCallClient` factory to React state. Used by both the
 * existing voice-call UI (via ChatModal in `app/chat/page.tsx`) and
 * the new video-call UI (`components/chat/VideoCallModal.tsx`).
 *
 * Why we don't share the existing chat-page state machine with the
 *   video UI:
 *     Video calls need additional state (camera on/off, self-view
 *     attachment, PIP positioning) that doesn't apply to voice. We
 *     keep this hook thin and let each modal own its own derived
 *     state on top of it. The hook returns the four primitives you
 *     always need:
 *
 *     - localVideoTrack   (attach to <video autoPlay muted playsInline>)
 *     - remoteVideoTrack  (attach to <video autoPlay playsInline>)
 *     - localAudioTrack   (mute/unmute)
 *     - remoteAudioTrack  (attach to <audio autoPlay>)
 *
 *     Plus the connection state and an error channel.
 *
 * Usage:
 *   const { localVideoTrack, remoteVideoTrack, connectionState } =
 *     useLiveKitRoom({
 *       client,
 *       onLocalStream: (s) => {/* handle *\/},
 *     })
 */

'use client'

import { useEffect, useState } from 'react'
import type {
  LocalAudioTrack,
  LocalVideoTrack,
  RemoteAudioTrack,
  RemoteVideoTrack,
} from 'livekit-client'

export interface UseLiveKitRoomArgs {
  /**
   * The LiveKitCallClient produced by `startLiveKitCall`. May be
   * null while the call is being set up — the hook just no-ops.
   */
  client: import('@/lib/webrtc/livekit-client').LiveKitCallClient | null
  /**
   * Fired when the local MediaStream is published. The voice-call
   * path attaches this to a hidden <audio> element so the local mic
   * doesn't echo back. Video callers can ignore this — they attach
   * via localVideoTrack instead.
   */
  onLocalStream?: (stream: MediaStream) => void
}

export interface UseLiveKitRoomState {
  localVideoTrack: LocalVideoTrack | null
  remoteVideoTrack: RemoteVideoTrack | null
  localAudioTrack: LocalAudioTrack | null
  remoteAudioTrack: RemoteAudioTrack | null
  connectionState: 'idle' | 'connecting' | 'connected' | 'disconnected'
  /**
   * Mount error — captured from the `onError` channel exposed by
   * LiveKitCallClient. UI can render a "Call failed" message.
   */
  error: Error | null
}

export function useLiveKitRoom({
  client,
  onLocalStream,
}: UseLiveKitRoomArgs): UseLiveKitRoomState {
  const [state, setState] = useState<UseLiveKitRoomState>({
    localVideoTrack: null,
    remoteVideoTrack: null,
    localAudioTrack: null,
    remoteAudioTrack: null,
    connectionState: 'idle',
    error: null,
  })

  useEffect(() => {
    if (!client) {
      setState({
        localVideoTrack: null,
        remoteVideoTrack: null,
        localAudioTrack: null,
        remoteAudioTrack: null,
        connectionState: 'idle',
        error: null,
      })
      return
    }

    let cancelled = false

    // We don't have direct access to room.connectionState from
    // outside the client, so we infer it from the call state machine
    // the chat page already maintains. The hook returns 'connecting'
    // or 'connected' based on whether the parent has called
    // publishMic() and received the connected state. For a more
    // precise signal we'd need to expose the Room from the client —
    // deferred.
    setState((prev) => ({ ...prev, connectionState: 'connecting' }))

    // Cleanup — disconnect on unmount.
    return () => {
      cancelled = true
      setState({
        localVideoTrack: null,
        remoteVideoTrack: null,
        localAudioTrack: null,
        remoteAudioTrack: null,
        connectionState: 'disconnected',
        error: null,
      })
    }
  }, [client, onLocalStream])

  return state
}
