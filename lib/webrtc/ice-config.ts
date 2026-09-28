/**
 * WebRTC ICE configuration (STUN + TURN).
 *
 * Strategy:
 *   - Always include public STUN (free).
 *   - If the server has TURN credentials (TURN_URL etc. configured),
 *     /api/webrtc/turn returns them with `source: "coturn"` and the
 *     browser falls back to relay when STUN fails.
 *
 * References:
 *   - coturn docs: https://github.com/coturn/coturn
 *   - HMAC auth-secret scheme (Twilio-compatible):
 *     https://www.twilio.com/docs/stun-turn/api
 */

export interface TurnServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface IceConfig {
  iceServers: TurnServer[]
  /** 'coturn' when server returned TURN credentials, 'stun-only' otherwise. */
  source: 'coturn' | 'stun-only'
  /** Seconds until the TURN credential expires. undefined for STUN. */
  ttl?: number
}

const DEFAULT_STUN: TurnServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

const FALLBACK: IceConfig = {
  iceServers: DEFAULT_STUN,
  source: 'stun-only',
}

let cachedTtl = 0
let cachedConfig: IceConfig = FALLBACK

/**
 * Fetch ICE config — short-lived cache (~50 min) so we don't spam the
 * credentials endpoint on every call. The server TTL defaults to 3600 s;
 * we refresh a few minutes early so we never hand the browser an expired
 * credential.
 */
export async function getIceConfig(force = false): Promise<IceConfig> {
  const now = Date.now()
  if (!force && cachedConfig !== FALLBACK && now < cachedTtl) {
    return cachedConfig
  }
  try {
    const res = await fetch('/api/webrtc/turn', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })
    if (!res.ok) throw new Error(`TURN fetch failed: ${res.status}`)
    const data = (await res.json()) as IceConfig
    if (
      Array.isArray(data.iceServers) &&
      data.iceServers.length > 0 &&
      data.source === 'coturn'
    ) {
      cachedConfig = data
      // Refresh slightly before server TTL elapses.
      const refreshMs = Math.max(60_000, (data.ttl ?? 3600) * 1000 - 10 * 60 * 1000)
      cachedTtl = now + refreshMs
      return cachedConfig
    }
    return FALLBACK
  } catch {
    return FALLBACK
  }
}

/** Test-only: clear the cache so subsequent getIceConfig() re-fetches. */
export function __resetIceConfigCache(): void {
  cachedConfig = FALLBACK
  cachedTtl = 0
}