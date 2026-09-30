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
import { jwtVerify } from 'jose'
import { rateLimit, getClientIp } from '@/utils/rate-limit'

export const dynamic = 'force-dynamic'

const TOKEN_TTL_SECONDS = 60 * 30 // 30 min — covers a long call plus retries

function getSecret(name: string): string | null {
  const v = process.env[name]
  if (!v || v.length < 8) return null
  return v
}

async function getAuthenticatedUserId(req: NextRequest): Promise<string | null> {
  // 1) SSR cookie session — try the @supabase/ssr cookie value
  //    directly. The cookie is NOT HttpOnly (httpOnly=false) so the
  //    request object can read it.
  const projectRef = (() => {
    try {
      return new URL(
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
          'https://pqvnjgyqbxlylawwogjv.supabase.co',
      ).hostname.split('.')[0]
    } catch {
      return null
    }
  })()
  if (projectRef) {
    const cookieName = `sb-${projectRef}-auth-token`
    const cookie = req.cookies.get(cookieName)
    if (cookie?.value) {
      let value = decodeURIComponent(cookie.value)
      if (value.startsWith('base64-')) value = value.slice('base64-'.length)
      const b64 = value.replace(/-/g, '+').replace(/_/g, '/')
      try {
        const session = JSON.parse(Buffer.from(b64, 'base64').toString('utf-8'))
        if (session?.access_token) return session.access_token
      } catch {
        /* fallthrough to localStorage path on the client */
      }
    }
  }

  // 2) Bearer access_token from the Authorization header. The chat
  //    page's `createClient(@supabase/ssr)` will pass it through.
  const auth = req.headers.get('authorization')
  if (auth?.startsWith('Bearer ')) {
    return auth.slice('Bearer '.length).trim() || null
  }
  return null
}

async function userIdFromJwt(jwt: string): Promise<string | null> {
  const secret = getSecret('SUPABASE_JWT_SECRET')
  if (!secret) return null
  try {
    const { payload } = await jwtVerify(
      jwt,
      new TextEncoder().encode(secret),
    )
    const sub = payload.sub
    return typeof sub === 'string' && sub.length > 0 ? sub : null
  } catch {
    return null
  }
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
  const wsUrl =
    process.env.NEXT_PUBLIC_LIVEKIT_URL ||
    process.env.LIVEKIT_URL ||
    ''
  if (!apiKey || !apiSecret || !wsUrl) {
    return NextResponse.json(
      { error: 'LiveKit is not configured on this server' },
      { status: 503 },
    )
  }

  const jwt = await getAuthenticatedUserId(req)
  if (!jwt) {
    return NextResponse.json(
      { error: 'Sign in to request a LiveKit token' },
      { status: 401 },
    )
  }
  const userId = await userIdFromJwt(jwt)
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
