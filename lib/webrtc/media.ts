/**
 * media — deferred microphone + camera permission helpers.
 *
 * Why this exists (2026-09-30 → 2026-10-01):
 *   The previous Stringee-based call client triggered `getUserMedia()`
 *   at the moment `call.makeCall()` / `call.answer()` was invoked —
 *   i.e. immediately after the user clicked Accept. On Chromium-based
 *   browsers this surfaces the OS-level mic permission prompt at a
 *   confusing time. We now own the WebRTC stack (see
 *   lib/webrtc/livekit-client.ts) and run `getUserMedia` ourselves,
 *   in our UX context, after the modal has been mounted.
 *
 *   On 2026-10-01 we extended the helper to optionally request the
 *   camera as well, for the video-call flow (`pending_calls.type =
 *   'video'`). Browsers will issue a single combined permission
 *   prompt for `audio + video`, so the UX is friendlier than asking
 *   twice (mic first → camera second).
 *
 * Flow:
 *   1. User clicks Accept / Phone button.
 *   2. We flip the call state to 'connecting' so the UI shows the
 *      CallModal — the user now has context for the permission ask.
 *   3. We call `ensureMediaPermissions({ video: bool })` which:
 *      - On first ask: shows the native combined prompt
 *      - On accept: returns a MediaStream with audio and (optionally)
 *        video tracks (caller publishes them via LiveKit)
 *      - On deny: throws a typed MicDeniedError / CamDeniedError so
 *        the caller can surface a friendly message.
 *
 *   For outgoing calls we prompt BEFORE startOutgoingCall so the
 *   stream is ready before the offer is created.
 */

/**
 * Error subtypes so the call UI can render distinct messages.
 */
export class MicDeniedError extends Error {
  readonly kind = 'denied' as const
  constructor(message = 'Microphone permission was denied.') {
    super(message)
    this.name = 'MicDeniedError'
  }
}

export class MicNotFoundError extends Error {
  readonly kind = 'not_found' as const
  constructor(message = 'No microphone was found on this device.') {
    super(message)
    this.name = 'MicNotFoundError'
  }
}

export class MicUnavailableError extends Error {
  readonly kind = 'unavailable' as const
  constructor(message = 'Microphone is unavailable. Check that no other app is using it.') {
    super(message)
    this.name = 'MicUnavailableError'
  }
}

export class CamDeniedError extends Error {
  readonly kind = 'denied' as const
  constructor(message = 'Camera permission was denied.') {
    super(message)
    this.name = 'CamDeniedError'
  }
}

export class CamNotFoundError extends Error {
  readonly kind = 'not_found' as const
  constructor(message = 'No camera was found on this device.') {
    super(message)
    this.name = 'CamNotFoundError'
  }
}

export class CamUnavailableError extends Error {
  readonly kind = 'unavailable' as const
  constructor(message = 'Camera is unavailable. Check that no other app is using it.') {
    super(message)
    this.name = 'CamUnavailableError'
  }
}

export interface MediaRequestOptions {
  /**
   * Request video in addition to audio. Browsers issue ONE combined
   * permission prompt when both audio + video are requested together
   * (per spec), so the UX is friendlier than asking twice. Defaults
   * to `false` (audio-only — preserves backward compat for the
   * voice-call flow that already calls `ensureMicPermission`).
   */
  video?: boolean
}

/**
 * Cached permission state so we don't ask twice on rapid back-to-back
 * calls. Cleared on a hard page reload (which is what the user has to
 * do if they want to re-trigger the native prompt after denying).
 */
let cachedStream: MediaStream | null = null
/** What we cached — prevents a cached audio-only stream from being
 *  returned for a video call request. */
let cachedStreamHasVideo = false

/**
 * Returns a microphone stream (with optional video), prompting the
 * user on first call. Stops all tracks and clears the cache on
 * subsequent calls so we never silently reuse a stale stream (e.g.
 * from a previous tab).
 *
 * Back-compat: when `opts.video` is omitted/false this behaves
 * identically to the legacy `ensureMicPermission()`. Callers that
 * already import that function keep working — we re-export it below.
 */
export async function ensureMediaPermissions(
  opts: MediaRequestOptions = {},
): Promise<MediaStream> {
  const wantVideo = opts.video === true

  if (
    typeof navigator === 'undefined' ||
    !navigator.mediaDevices?.getUserMedia
  ) {
    throw new MicUnavailableError('Browser does not support microphone access.')
  }

  // Reuse a cached stream only if it's still live AND matches the
  // request shape (audio-only vs. audio+video).
  if (
    cachedStream &&
    cachedStreamHasVideo === wantVideo &&
    cachedStream.getTracks().some((t) => t.readyState === 'live')
  ) {
    return cachedStream
  }
  releaseCachedStream()

  try {
    const constraints: MediaStreamConstraints = {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: wantVideo
        ? {
            // Front-facing camera by default — `facingMode: 'user'`
            // works on mobile browsers; desktop browsers ignore it
            // and use the default webcam.
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 },
            frameRate: { ideal: 24 },
          }
        : false,
    }
    const stream = await navigator.mediaDevices.getUserMedia(constraints)
    cachedStream = stream
    cachedStreamHasVideo = wantVideo
    return stream
  } catch (err) {
    const name = (err as { name?: string }).name ?? ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      // Browsers raise NotAllowedError for EITHER audio or video
      // denial — we don't know which. The MicDeniedError message is
      // a safe default because voice-only is the most common case;
      // video callers can show the same copy.
      throw new MicDeniedError(
        wantVideo
          ? 'Microphone or camera permission was denied.'
          : 'Microphone permission was denied.',
      )
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      if (wantVideo) throw new CamNotFoundError()
      throw new MicNotFoundError()
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      if (wantVideo) throw new CamUnavailableError()
      throw new MicUnavailableError()
    }
    throw err
  }
}

/**
 * Voice-call entry point. Equivalent to `ensureMediaPermissions({})`
 * — kept for backward compatibility with the chat page's existing
 * imports.
 */
export async function ensureMicPermission(): Promise<MediaStream> {
  return ensureMediaPermissions({ video: false })
}

/**
 * Stop all tracks and clear the cached stream. Call this when a call
 * ends so the next call re-prompts (which is also when the user
 * expects to see the prompt).
 */
export function releaseMic(): void {
  releaseCachedStream()
}

/**
 * Drop the cached media stream and stop its tracks. Exposed so the
 * video-call flow can explicitly invalidate after a call ends.
 */
export function releaseMediaPermissions(): void {
  releaseCachedStream()
}

function releaseCachedStream(): void {
  if (!cachedStream) return
  for (const track of cachedStream.getTracks()) {
    try {
      track.stop()
    } catch {
      /* swallow */
    }
  }
  cachedStream = null
  cachedStreamHasVideo = false
}

/**
 * Read the current permission state without prompting. Returns
 * 'granted' | 'denied' | 'prompt' | 'unknown'. Useful for UI hints
 * ("We'll ask for microphone access when you click Accept").
 *
 * Only checks microphone — we don't bother with `camera` because
 * users are conditioned to expect a single permission prompt, not
 * separate "mic-only" vs. "mic+cam" status indicators.
 */
export async function queryMicPermissionState(): Promise<
  'granted' | 'denied' | 'prompt' | 'unknown'
> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown'
  }
  try {
    const result = await navigator.permissions.query({
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      name: 'microphone' as any,
    })
    const state = result.state
    if (state === 'granted' || state === 'denied' || state === 'prompt') {
      return state
    }
    return 'unknown'
  } catch {
    return 'unknown'
  }
}
