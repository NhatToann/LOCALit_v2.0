/**
 * WebRTC STUN/TURN configuration.
 *
 * Strategy:
 *   - Always include Google public STUN servers (free).
 *   - If Twilio NTS env vars are set, fetch short-lived credentials from
 *     /api/webrtc/turn and use them. Otherwise fall back to STUN-only
 *     (which works ~70% of the time on consumer networks).
 *
 * References:
 *   - Twilio Network Traversal Service docs:
 *     https://www.twilio.com/docs/stun-turn/api
 */

export interface TurnServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export interface IceConfig {
  iceServers: TurnServer[]
  iceTransportPolicy?: 'all' | 'relay'
}

export const DEFAULT_STUN: TurnServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

const FALLBACK_ICE_CONFIG: IceConfig = {
  iceServers: DEFAULT_STUN,
}

let cachedTtl = 0
let cachedConfig: IceConfig = FALLBACK_ICE_CONFIG

/**
 * Fetch ICE config — short-lived cache (~50 min) so we don't spam the
 * credentials endpoint on every call.
 */
export async function getIceConfig(force = false): Promise<IceConfig> {
  const now = Date.now()
  if (!force && cachedConfig !== FALLBACK_ICE_CONFIG && now < cachedTtl) {
    return cachedConfig
  }
  try {
    const res = await fetch('/api/webrtc/turn', { method: 'POST' })
    if (!res.ok) throw new Error(`TURN fetch failed: ${res.status}`)
    const data = await res.json()
    if (data.iceServers && Array.isArray(data.iceServers) && data.iceServers.length > 0) {
      cachedConfig = { iceServers: data.iceServers }
      cachedTtl = now + 50 * 60 * 1000
      return cachedConfig
    }
    return FALLBACK_ICE_CONFIG
  } catch {
    return FALLBACK_ICE_CONFIG
  }
}
