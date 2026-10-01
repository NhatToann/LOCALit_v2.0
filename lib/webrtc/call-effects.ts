/**
 * call-effects — audio chime + haptic feedback for call UX events.
 *
 * Per the voice/video-call spec (2026-10-01):
 *   "Mỗi hành động bấm nút Trả lời / Tắt máy đều có phản hồi âm thanh
 *    (Chime sound) và rung (Haptic feedback) để người dùng nhận biết
 *    tức thì."
 *
 * Why hand-rolled Web Audio (not <audio> tags):
 *   - We need the chime to fire even when the user has their media
 *   volume at 0 — a programmatic WebAudio source can be set to a
 *   fixed gain.
 *   - We want the chime to be SHORT (≤120ms) so it never overlaps
 *   speech.
 *   - Chimes must not require any external audio asset (offline
 *   build, no /public assets to manage, no preload).
 *
 * Tactile feedback uses navigator.vibrate() on supported devices.
 * iOS Safari historically lacked support; we feature-detect and
 * no-op gracefully.
 *
 * Privacy:
 *   - We do NOT request microphone / camera access from these helpers.
 *   - The chime's gain is intentionally modest (default 0.35) so it
 *   doesn't startle users in quiet environments.
 */

let audioCtx: AudioContext | null = null

/**
 * Lazily-initialised AudioContext. Some browsers throw if you call
 * `new AudioContext()` synchronously on a user gesture's first frame
 * (Safari "AudioContext was not allowed to start"). We defer creation
 * to the first call site that needs it.
 */
function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (audioCtx) return audioCtx
  const Ctor =
    window.AudioContext ??
    (window as Window & { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext
  if (!Ctor) return null
  audioCtx = new Ctor()
  return audioCtx
}

function vibrate(pattern: number | number[]): void {
  if (typeof navigator === 'undefined') return
  // navigator.vibrate is no-op on iOS Safari and unsupported
  // browsers. Spec compliance is best-effort.
  const nav = navigator as Navigator & {
    vibrate?: (p: number | number[]) => boolean
  }
  if (typeof nav.vibrate !== 'function') return
  try {
    nav.vibrate(pattern)
  } catch {
    /* ignore */
  }
}

interface ChimeOptions {
  /** Override the default 0.35 gain. 0..1. */
  gain?: number
}

/**
 * Play a short sine-wave tone.
 *
 * `freqHz` is the base frequency; we wrap the attack / release in
 * GainNode ramps so there are no clicks. Default duration is 80 ms.
 */
function playTone(freqHz: number, durationMs: number, opts: ChimeOptions = {}): void {
  const ctx = getCtx()
  if (!ctx) return
  // Some browsers start AudioContext suspended after page load;
  // resume on the user-gesture-triggered call.
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => undefined)
  }
  const now = ctx.currentTime
  const gainTarget = opts.gain ?? 0.35
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freqHz, now)
  gain.gain.setValueAtTime(0, now)
  gain.gain.linearRampToValueAtTime(gainTarget, now + 0.005)
  gain.gain.linearRampToValueAtTime(0, now + durationMs / 1000)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(now)
  osc.stop(now + durationMs / 1000)
}

/**
 * Inbound-call chime. Two-note rising tone (E5 → A5) — universal
 * "something just happened" pattern. ~160 ms total.
 */
export function chimeAccept(): void {
  playTone(659.25, 80) // E5
  setTimeout(() => playTone(880, 80), 90) // A5
  vibrate(20)
}

/**
 * End-call / disconnect chime. Single descending tone (G4 → D4) —
 * short enough not to overlap speech.
 */
export function chimeEnd(): void {
  playTone(392, 100) // G4
  vibrate(15)
}

/**
 * Decline / miss chime. Lower single tone. Distinct from `chimeEnd` so
 * the recipient's UI doesn't think the call ended normally.
 */
export function chimeDecline(): void {
  playTone(293.66, 120) // D4
  vibrate([10, 30, 10])
}

/**
 * Outgoing-ring chime. Faint repeating tick so the caller has
 * feedback that the call is being placed (matches the platform-level
 * "dialing" tone).
 */
let ringInterval: ReturnType<typeof setInterval> | null = null
export function startOutgoingRing(): void {
  if (ringInterval != null) return
  ringInterval = setInterval(() => playTone(523.25, 60), 1500)
}
export function stopOutgoingRing(): void {
  if (ringInterval == null) return
  clearInterval(ringInterval)
  ringInterval = null
}

/**
 * Mute-toggle / UNmute-tap chime. High-pitched very-short click so
 * they get a tactile confirmation even when the icon-only button is
 * small.
 */
export function chimeToggle(): void {
  playTone(1200, 30)
  vibrate(5)
}