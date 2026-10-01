/**
 * Probe: mint a LiveKit token locally and curl the LiveKit Cloud
 * project info endpoint to verify the API key + secret are valid.
 *
 * Run with: node scripts/probe-livekit.mjs
 *
 * Requires:
 *   LIVEKIT_API_KEY=APIVnqy9qJSiJ58
 *   LIVEKIT_API_SECRET=<the secret you set in Vercel>
 *   LIVEKIT_URL=wss://localit-tntjqmfu.livekit.cloud
 */
import { AccessToken } from 'livekit-server-sdk'

const apiKey = process.env.LIVEKIT_API_KEY
const apiSecret = process.env.LIVEKIT_API_SECRET
const wsUrl = process.env.LIVEKIT_URL || 'wss://localit-tntjqmfu.livekit.cloud'

if (!apiKey || !apiSecret) {
  console.error('Set LIVEKIT_API_KEY and LIVEKIT_API_SECRET env vars first.')
  process.exit(1)
}

// Re-encode the secret exactly the way Vercel would have ingested it.
// Vercel trims trailing whitespace; PowerShell pipes sometimes
// truncated the secret. We just print the lengths.
console.log('apiKey:', JSON.stringify(apiKey))
console.log('apiSecret length:', apiSecret.length)
console.log('wsUrl:', wsUrl)

const at = new AccessToken(apiKey, apiSecret, {
  identity: 'probe-user',
  ttl: 60 * 30,
})
at.addGrant({
  room: 'call:00000000-0000-0000-0000-000000000001',
  roomJoin: true,
  canPublish: true,
  canSubscribe: true,
  canPublishData: true,
})

const token = await at.toJwt()
console.log('\nJWT length:', token.length)
console.log('JWT preview:', token.slice(0, 60), '...')

// Convert wss:// → https:// for the project metadata probe.
const httpsUrl = wsUrl.replace(/^wss:/, 'https:').replace(/\/rtc\/.*$/, '')
console.log('\nProbing', httpsUrl + '/', '...')

const probeResp = await fetch(httpsUrl + '/', {
  method: 'GET',
  headers: {
    Authorization: 'Bearer ' + token,
  },
})
console.log('Response status:', probeResp.status)
const probeText = await probeResp.text().catch(() => '')
console.log('Response preview:', probeText.slice(0, 200))
