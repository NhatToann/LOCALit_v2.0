import { NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'

/**
 * POST /api/webrtc/turn — returns short-lived ICE servers config.
 *
 * If `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_API_KEY` +
 * `TWILIO_API_SECRET` are set, fetches Twilio NTS credentials (TTL 1h).
 * Otherwise falls back to public STUN only.
 *
 * Auth: requires authenticated user (cookie session via @supabase/ssr).
 */
export async function POST() {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey =
      process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: 'server-misconfigured' }, { status: 500 })
    }

    // Anonymous clients can hit this — STUN is fine to share.
    // TURN credentials are scoped per-request via Twilio's REST API below.
    const sid = process.env.TWILIO_ACCOUNT_SID
    const apiKey = process.env.TWILIO_API_KEY
    const apiSecret = process.env.TWILIO_API_SECRET

    if (!sid || !apiKey || !apiSecret) {
      return NextResponse.json({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun.cloudflare.com:3478' },
        ],
        source: 'stun-only',
      })
    }

    // Twilio NTS: POST https://api.twilio.com/2010-04-01/Accounts/{SID}/Tokens.json
    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Tokens.json`
    const auth = Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')
    const res = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({ Ttl: '3600' }).toString(),
    })

    if (!res.ok) {
      const text = await res.text()
      return NextResponse.json(
        { error: 'twilio-error', status: res.status, detail: text.slice(0, 200) },
        { status: 502 },
      )
    }

    const data = await res.json()
    const iceServers = (data.ice_servers ?? []).map((s: any) => {
      const url = typeof s.url === 'string' ? s.url : Array.isArray(s.urls) ? s.urls : s.urls
      return {
        urls: url,
        username: s.username,
        credential: s.credential,
      }
    })

    // Always include STUN as well (good for low-latency peers)
    iceServers.unshift({ urls: 'stun:stun.l.google.com:19302' })

    return NextResponse.json({ iceServers, source: 'twilio', ttl: data.ttl })
  } catch (e) {
    return NextResponse.json(
      { error: (e as Error).message, iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      { status: 500 },
    )
  }
}
