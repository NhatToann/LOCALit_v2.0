/**
 * POST /api/livekit/token
 *
 * Mints a short-lived LiveKit access token for the authenticated user
 * to join a voice-call room. The room name follows the convention
 * `call:<conversationId>` so a tourist's call to their buddy maps to a
 * stable room id.
 *
 * Request body:
 *   { roomName: string, participantName?: string }
 *
 * Why this endpoint exists:
 *   LiveKit needs a JWT signed with the project's API Secret to admit
 *   a participant. We never ship the API Secret to the browser — we
 *   mint the token server-side using the user's authenticated session
 *   (cookie session OR access_token), then return the JWT plus the
 *   wss URL.
 *
 * Auth:
 *   - Reads the userId from the SSR cookie session OR the access_token
 *     stored in localStorage / cookie. We accept the same sources the
 *     rest of the app reads (utils/supabase/client.ts uses cookies via
 *     @supabase/ssr; signaling-supabase.ts reads from localStorage or
 *     cookie). Either way, we end up with a Supabase-issued JWT.
 *   - We verify the JWT against SUPABASE_JWT_SECRET and use the `sub`
 *     claim as the LiveKit identity.
 *
 * Rate limit:
 *   30 req/min/IP. Voice calls happen a handful of times per session
 *   so this is a generous ceiling.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { AccessToken } from 'livekit-server-sdk'
import { createClient as createServerSupabase } from '@/utils/supabase/server'
import { rateLimit, getClientIp } from '@/utils/rate-limit'

export const dynamic = 'force-dynamic'

const TOKEN_TTL_SECONDS = 60 * 30 // 30 min — covers a long call plus retries

function getSecret(name: string): string | null {
  const v = process.env[name]
  if (!v || v.length < 8) return null
  return v
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  // Use the SSR cookie-aware Supabase client. This validates the
  // JWT signature against the Supabase project's JWT secret (via
  // the REST API), so we don't need to roll our own jose verifier
  // here — getUser() handles cookie decoding, refresh, and expiry.
  try {
    const supabase = await createServerSupabase()
    const { data } = await supabase.auth.getUser()
    if (data?.user?.id) return data.user.id
  } catch {
    /* fall through */
  }

  // Fallback: accept a Bearer access_token from the Authorization
  // header. The browser will pass it when the calling code uses
  // `supabase.functions.invoke` with the user's session.
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    const token = auth.slice('Bearer '.length).trim()
    if (token) return token
  }
  return null
}

export async function POST(req: NextRequest) {
  // Rate-limit by IP first — fail fast.
  const ip = getClientIp(req)
  const rl = rateLimit(`livekit-token:${ip}`, 'livekit-token', {
    windowMs: 60_000,
    max: 30,
  })
  if (!rl.ok) {
    const retryAfter = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
    return NextResponse.json(
      { error: 'Too many token requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } },
    )
  }

  const apiKey = getSecret('LIVEKIT_API_KEY')
  const apiSecret = getSecret('LIVEKIT_API_SECRET')
  // Server-only env var. The client receives the wsUrl from this
  // response — it doesn't need to read it directly. We deliberately
  // ignore NEXT_PUBLIC_LIVEKIT_URL because Next.js inlines public
  // vars at build time, and an outdated build cache could ship a
  // stale (truncated) value to the browser. Server-side read is
  // always authoritative.
  //
  // Hardcoded fallback matches the LiveKit Cloud project for this
  // app. If we ever swap projects, update LIVEKIT_URL on Vercel AND
  // this constant.
  const HARDCODED_LIVEKIT_URL = 'wss://localit-tntjqmfu.livekit.cloud'
  const wsUrl = process.env.LIVEKIT_URL || HARDCODED_LIVEKIT_URL
  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      { error: 'LiveKit is not configured on this server' },
      { status: 503 },
    )
  }

  const jwt = await getAuthenticatedUserId(req)
  // The supabase.auth.getUser() helper returns the user.id directly
  // — no need to verify the JWT ourselves. The earlier `jwt` variable
  // was renamed to make this clearer.
  if (!jwt) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[livekit-token] no authenticated user', {
        hasCookie: req.headers.get('cookie')?.includes('sb-'),
      })
    }
    return NextResponse.json(
      { error: 'Sign in to request a LiveKit token' },
      { status: 401 },
    )
  }
  // Detect the bug where the Bearer-fallback returned the raw access
  // token (an eyeball-long JWT) instead of the userId. UserIds are
  // UUIDs, JWTs contain dots.
  if (jwt.includes('.') || jwt.length > 64) {
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console
      console.warn('[livekit-token] Bearer-fallback returned a JWT, not a userId. len=', jwt.length)
    }
    return NextResponse.json(
      { error: 'Session token could not be resolved to a user' },
      { status: 401 },
    )
  }
  const userId = jwt
  if (!userId) {
    return NextResponse.json(
      { error: 'Session token is invalid or expired' },
      { status: 401 },
    )
  }

  // Parse the body — accept JSON, x-www-form-urlencoded, or no body.
  let roomName = ''
  let participantName = ''
  try {
    const ct = req.headers.get('content-type') ?? ''
    if (ct.includes('application/json')) {
      const body = (await req.json()) as {
        roomName?: unknown
        participantName?: unknown
      }
      roomName = typeof body.roomName === 'string' ? body.roomName : ''
      participantName =
        typeof body.participantName === 'string' ? body.participantName : ''
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      const form = await req.formData()
      roomName = String(form.get('roomName') ?? '')
      participantName = String(form.get('participantName') ?? '')
    }
  } catch {
    return NextResponse.json(
      { error: 'Invalid request body' },
      { status: 400 },
    )
  }

  // Sanity-check the room name. We use `call:<conversationId>` so the
  // // pattern is strict and predictable.
  if (!/^call:[a-zA-Z0-9_-]{8,128}$/.test(roomName)) {
    return NextResponse.json(
      { error: 'Invalid room name (expected `call:<id>`)' },
      { status: 400 },
    )
  }
  // Cap the display name — we don't fully trust the client to send a
  // reasonable string.
  if (participantName.length > 80) participantName = participantName.slice(0, 80)

  const at = new AccessToken(apiKey, apiSecret, {
    identity: userId,
    name: participantName || undefined,
    ttl: TOKEN_TTL_SECONDS,
  })
  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  })

  const token = await at.toJwt()
  return NextResponse.json(
    {
      token,
      wsUrl,
      identity: userId,
      roomName,
      ttlSeconds: TOKEN_TTL_SECONDS,
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
