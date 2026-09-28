import { NextResponse } from 'next/server'
import { createHmac } from 'node:crypto'

/**
 * POST /api/webrtc/turn — returns ICE servers config for WebRTC peers.
 *
 * Strategy (2026-09-28 redesign for self-hosted coturn):
 *   - Always include Google + Cloudflare STUN (free, low-latency for
 *     peers on permissive networks).
 *   - If TURN_URL + TURN_REALM + TURN_SHARED_SECRET are set, issue a
 *     HMAC-SHA1-derived short-lived credential (Twilio NTS compatible).
 *     coturn's `use-auth-secret` flag verifies the same scheme, so no
 *     per-user DB row or per-call coordination is required.
 *   - Otherwise fall back to STUN-only (which works ~70% of the time
 *     on consumer networks).
 *
 * Auth: this route is public on purpose. STUN servers are public, and
 * TURN credentials are HMAC-derived per request and expire in 1 hour.
 * Rate limiting is handled by Vercel's edge layer.
 *
 * Env vars consumed (set in Vercel → Settings → Environment Variables):
 *   TURN_URL           e.g. "turn:turn.localit.dev:3478" or
 *                      "turns:turn.localit.dev:5349?transport=tcp" for
 *                      symmetric NAT fallback. Comma-separated for
 *                      multiple transports.
 *   TURN_REALM         e.g. "turn.localit.dev" — MUST match the realm
 *                      in turnserver.conf so coturn accepts the user.
 *   TURN_SHARED_SECRET 32+ byte hex string shared with coturn's
 *                      static-auth-secret. Same value on both ends.
 *   TURN_TTL_SECONDS   optional, defaults to 3600 (1 h).
 */

const DEFAULT_STUN: { urls: string }[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
]

function deriveTurnCredential(
  secret: string,
  username: string,
): string {
  // coturn expects base64(HMAC-SHA1(secret, username)). Same scheme as
  // Twilio NTS — see https://www.twilio.com/docs/stun-turn/api
  const hmac = createHmac('sha1', secret)
  hmac.update(username)
  return hmac.digest('base64')
}

export async function POST() {
  const turnUrlRaw = process.env.TURN_URL
  const turnRealm = process.env.TURN_REALM
  const turnSecret = process.env.TURN_SHARED_SECRET
  const ttl = Number.parseInt(process.env.TURN_TTL_SECONDS ?? '3600', 10)

  // No TURN configured → STUN only (will fail on symmetric NAT)
  if (!turnUrlRaw || !turnRealm || !turnSecret) {
    return NextResponse.json({
      iceServers: DEFAULT_STUN,
      source: 'stun-only',
    })
  }

  // Parse comma-separated URL list into RTCIceServer entries. Supports
  // both plain `turn:host:port` and `turns:host:port?transport=tcp`.
  const urls = turnUrlRaw
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean)
    .map((u) => (u.includes('?') ? u : u))

  // Username = "<expiry-unixtime>:<userid>". coturn reads the expiry from
  // the leading colon-separated number; the userid suffix is just for
  // log correlation.
  const expiry = Math.floor(Date.now() / 1000) + ttl
  const userId =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 12)
      : Math.random().toString(36).slice(2, 14)
  const username = `${expiry}:${userId}`
  const credential = deriveTurnCredential(turnSecret, username)

  return NextResponse.json({
    iceServers: [
      ...DEFAULT_STUN,
      {
        urls,
        username,
        credential,
      },
    ],
    source: 'coturn',
    ttl,
    realm: turnRealm,
  })
}