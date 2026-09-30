/**
 * Inspect a Vercel env var by writing a small probe route that
 * echoes `process.env[name]` back to the client. Delete after
 * debugging.
 */
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    LIVEKIT_URL: process.env.LIVEKIT_URL ?? null,
    NEXT_PUBLIC_LIVEKIT_URL: process.env.NEXT_PUBLIC_LIVEKIT_URL ?? null,
    LIVEKIT_API_KEY_len: process.env.LIVEKIT_API_KEY?.length ?? 0,
  })
}