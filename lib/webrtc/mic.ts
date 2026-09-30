/**
 * mic — deferred microphone permission helper.
 *
 * Why this exists (2026-09-30):
 *   The previous Stringee-based call client triggered `getUserMedia()`
 *   at the moment `call.makeCall()` / `call.answer()` was invoked —
 *   i.e. immediately after the user clicked Accept. On Chromium-based
 *   browsers this surfaces the OS-level mic permission prompt at a
 *   confusing time (the user just clicked Accept but doesn't yet see
 *   why the prompt is asking). Worse: if the user declined the
 *   permission, the call silently failed with no actionable error.
 *
 *   We now own the WebRTC stack (see lib/webrtc/webrtc-client.ts)
 *   and can run `getUserMedia` ourselves, in our UX context, after
 *   the modal has been mounted. The flow:
 *
 *     1. User clicks Accept / Phone button.
 *     2. We flip the call state to 'connecting' so the UI shows the
 *        CallModal — the user now has context for the permission ask.
 *     3. We call `ensureMicPermission()` which:
 *        - On first ask: shows the native prompt
 *        - On accept: returns the MediaStream (caller attaches it to
 *          the RTCPeerConnection)
 *        - On deny: throws a typed MicDeniedError so the caller can
 *          surface a friendly "Microphone access required" message
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

/**
 * Cached permission state so we don't ask twice on rapid back-to-back
 * calls. Cleared on a hard page reload (which is what the user has to
 * do if they want to re-trigger the native prompt after denying).
 */
let cachedStream: MediaStream | null = null

/**
 * Returns the current microphone stream, prompting the user on first
 * call. Stops all tracks and clears the cache on subsequent calls so
 * we never silently reuse a stale stream (e.g. from a previous tab).
 */
export async function ensureMicPermission(): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    throw new MicUnavailableError('Browser does not support microphone access.')
  }

  // Reuse a cached stream only if its tracks are still live.
  if (cachedStream) {
    const live = cachedStream.getTracks().some((t) => t.readyState === 'live')
    if (live) return cachedStream
    releaseCachedStream()
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
      video: false,
    })
    cachedStream = stream
    return stream
  } catch (err) {
    const name = (err as { name?: string }).name ?? ''
    if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
      throw new MicDeniedError()
    }
    if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
      throw new MicNotFoundError()
    }
    if (name === 'NotReadableError' || name === 'TrackStartError') {
      throw new MicUnavailableError()
    }
    throw err
  }
}

/**
 * Stop all tracks and clear the cached stream. Call this when a call
 * ends so the next call re-prompts (which is also when the user
 * expects to see the prompt).
 */
export function releaseMic(): void {
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
}

/**
 * Read the current permission state without prompting. Returns
 * 'granted' | 'denied' | 'prompt' | 'unknown'. Useful for UI hints
 * ("We'll ask for microphone access when you click Accept").
 */
export async function queryMicPermissionState(): Promise<
  'granted' | 'denied' | 'prompt' | 'unknown'
> {
  if (typeof navigator === 'undefined' || !navigator.permissions?.query) {
    return 'unknown'
  }
  try {
    // The Permissions API name is 'microphone' on Chromium-based
    // browsers; Firefox/Safari may not support it. Wrap in try/catch
    // so we degrade gracefully.
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
