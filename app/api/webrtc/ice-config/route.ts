/**
 * GET /api/webrtc/ice-config
 *
 * Returns the ICE servers (STUN/TURN) the WebRTC client should use
 * when establishing peer connections. Today this is just Google
 * public STUN — free and works for ~80% of NAT topologies.
 *
 * To upgrade to TURN (coturn / Twilio / Cloudflare) later, set
 * TURN_URL + TURN_USERNAME + TURN_CREDENTIAL env vars and this
 * endpoint will surface them. No client change required.
 */

import { NextResponse } from 'next/server'

interface IceServer {
  urls: string | string[]
  username?: string
  credential?: string
}

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(): Promise<NextResponse> {
  const iceServers: IceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ]

  const turnUrl = process.env.TURN_URL
  const turnUser = process.env.TURN_USERNAME
  const turnCred = process.env.TURN_CREDENTIAL

  if (turnUrl && turnUser && turnCred) {
    iceServers.push({
      urls: turnUrl.includes(',') ? turnUrl.split(',').map((s) => s.trim()) : turnUrl,
      username: turnUser,
      credential: turnCred,
    })
  }

  return NextResponse.json(
    { iceServers },
    {
      headers: {
        'cache-control': 'public, max-age=300',
      },
    },
  )
}
