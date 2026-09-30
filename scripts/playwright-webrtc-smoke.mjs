/**
 * Tiny smoke test: verify that two Playwright Chromium contexts can
 * establish a real WebRTC connection (no Stringee in the path).
 *
 * This bypasses our chat page entirely. It just spins up 2 pages
 * sharing getUserMedia streams via RTCPeerConnection, exchanging
 * SDP/ICE through Supabase Realtime broadcast. If THIS works, then
 * the only thing our chat pipeline needs to do is hook into the
 * same signaling pattern.
 *
 * Run with:
 *   SUPABASE_URL=https://pqvnjgyqbxlylawwogjv.supabase.co \
 *   SUPABASE_ANON_KEY=sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE \
 *   BUDDY_USER_ID=11111111-1111-1111-1111-111111111111 \
 *   TOURIST_USER_ID=aaaa1111-1111-1111-1111-111111111111 \
 *   BUDDY_ACCESS_TOKEN=... \
 *   TOURIST_ACCESS_TOKEN=... \
 *     node scripts/playwright-webrtc-smoke.mjs
 */

import { chromium } from 'playwright'

const SUPABASE_URL =
  process.env.SUPABASE_URL ?? 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ??
  'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const TOURIST = {
  id: process.env.TOURIST_USER_ID,
  token: process.env.TOURIST_ACCESS_TOKEN,
  email: process.env.TOURIST_EMAIL,
}
const BUDDY = {
  id: process.env.BUDDY_USER_ID,
  token: process.env.BUDDY_ACCESS_TOKEN,
  email: process.env.BUDDY_EMAIL,
}

for (const v of [
  ['TOURIST_USER_ID', TOURIST.id],
  ['TOURIST_ACCESS_TOKEN', TOURIST.token],
  ['TOURIST_EMAIL', TOURIST.email],
  ['BUDDY_USER_ID', BUDDY.id],
  ['BUDDY_ACCESS_TOKEN', BUDDY.token],
  ['BUDDY_EMAIL', BUDDY.email],
]) {
  if (!v[1]) {
    console.error(`Missing ${v[0]} env var`)
    process.exit(2)
  }
}

const PAGE_HTML = String.raw`
<!doctype html>
<html><head><title>smoke</title></head><body>
<h1 id="h">waiting</h1>
<pre id="log"></pre>
<script type="module">
const log = (...args) => {
  document.getElementById('log').textContent += args.join(' ') + '\n'
  console.log(...args)
}
window.addEventListener('error', (e) => log('error', e.message))
const url = '__SUPABASE_URL__'
const key = '__SUPABASE_KEY__'
const myId = '__MY_ID__'
const peerId = '__PEER_ID__'

// Use the same pattern as lib/webrtc/webrtc-client.ts.
const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2')
const supabase = createClient(url, key, {
  global: { headers: { Authorization: 'Bearer __MY_TOKEN__' } },
})

const channel = supabase.channel('calls:' + myId, {
  config: { broadcast: { self: false, ack: false } },
})
const inbox = []
channel.on('broadcast', { event: 'signal' }, (raw) => {
  const msg = raw.payload
  log('recv', JSON.stringify(msg).slice(0, 80))
  inbox.push(msg)
  window.__inbox = inbox
})
await new Promise((resolve) => {
  channel.subscribe((status) => {
    if (status === 'SUBSCRIBED') {
      log('subscribed as', myId)
      resolve()
    }
    if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
      log('sub status', status)
      resolve()
    }
  })
})

async function sendMsg(msg) {
  const target = supabase.channel('calls:' + peerId, {
    config: { broadcast: { self: false, ack: false } },
  })
  await new Promise((r) => {
    target.subscribe((s) => {
      if (s === 'SUBSCRIBED' || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') r()
    })
  })
  await target.send({ type: 'broadcast', event: 'signal', payload: msg })
  await supabase.removeChannel(target)
}

window.__send = sendMsg
window.__inbox = inbox

const iceConfig = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] }
const pc = new RTCPeerConnection(iceConfig)
window.__pc = pc
let localStream
try {
  localStream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true },
    video: false,
  })
  log('getUserMedia OK')
} catch (e) {
  log('getUserMedia FAILED', e.message)
}
window.__localStream = localStream
if (localStream) {
  for (const track of localStream.getAudioTracks()) pc.addTrack(track, localStream)
}
pc.onicecandidate = (e) => {
  if (e.candidate) {
    log('local ICE', e.candidate.candidate.slice(0, 60))
    window.__send({ type: 'ice', from: myId, to: peerId, candidate: e.candidate.toJSON() }).catch(()=>{})
  }
}
pc.ontrack = (e) => {
  log('ontrack', e.streams[0]?.getTracks().length, 'tracks')
  window.__remoteStream = e.streams[0]
}
pc.onconnectionstatechange = () => log('pc state', pc.connectionState)
pc.oniceconnectionstatechange = () => log('ice state', pc.iceConnectionState)

const role = '__ROLE__'
if (role === 'caller') {
  // Wait for both sides to subscribe before creating the offer.
  await new Promise((r) => setTimeout(r, 1500))
  const offer = await pc.createOffer()
  await pc.setLocalDescription(offer)
  await sendMsg({ type: 'offer', from: myId, to: peerId, sdp: offer })
  log('offer sent')
} else {
  log('callee waiting for offer')
}

async function setRemote(msg) {
  if (msg.type === 'offer' && msg.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)
    await sendMsg({ type: 'answer', from: myId, to: peerId, sdp: answer })
    log('answer sent')
  } else if (msg.type === 'answer' && msg.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp))
    log('answer received')
  } else if (msg.type === 'ice' && msg.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(msg.candidate))
      log('remote ICE added')
    } catch (e) {
      log('addIce err', e.message)
    }
  }
}
// Poll for new messages.
setInterval(async () => {
  while (window.__inbox.length > 0) {
    const msg = window.__inbox.shift()
    if (msg.to === myId) {
      try { await setRemote(msg) } catch (e) { log('handler err', e.message) }
    }
  }
}, 200)
document.getElementById('h').textContent = 'ready'
</script>
</body></html>
`

function pageHtml(role, myId, peerId, myToken) {
  return PAGE_HTML
    .replace(/__SUPABASE_URL__/g, SUPABASE_URL)
    .replace(/__SUPABASE_KEY__/g, ANON_KEY)
    .replace(/__MY_ID__/g, myId)
    .replace(/__PEER_ID__/g, peerId)
    .replace(/__MY_TOKEN__/g, myToken)
    .replace(/__ROLE__/g, role)
}

async function smoke() {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--no-sandbox',
      '--enable-features=WebRTC-H264WithOpenH264FFmpeg',
    ],
  })
  // Use file:// URLs so the page is a secure context for
  // navigator.mediaDevices. Inline data: URLs and setContent() make
  // mediaDevices undefined.
  const fs = await import('fs/promises')
  const path = await import('path')
  const callerHtml = pageHtml('caller', TOURIST.id, BUDDY.id, TOURIST.token)
  const calleeHtml = pageHtml('callee', BUDDY.id, TOURIST.id, BUDDY.token)
  const tmpDir = await fs.mkdtemp((await import('os')).tmpdir() + path.sep + 'localit-smoke-')
  const callerFile = path.resolve(tmpDir, 'caller.html')
  const calleeFile = path.resolve(tmpDir, 'callee.html')
  await fs.writeFile(callerFile, callerHtml)
  await fs.writeFile(calleeFile, calleeHtml)

  const callerCtx = await browser.newContext({
    permissions: ['microphone'],
  })
  const calleeCtx = await browser.newContext({
    permissions: ['microphone'],
  })
  const callerPage = await callerCtx.newPage()
  const calleePage = await calleeCtx.newPage()

  callerPage.on('console', (m) =>
    console.log(`  [caller] ${m.type()} ${m.text()}`),
  )
  calleePage.on('console', (m) =>
    console.log(`  [callee] ${m.type()} ${m.text()}`),
  )

  console.log('[smoke] loading file:// pages…')
  await Promise.all([
    callerPage.goto('file://' + callerFile),
    calleePage.goto('file://' + calleeFile),
  ])
  // Wait for "ready" on both pages.
  await callerPage.locator('#h:has-text("ready")').waitFor({ timeout: 30_000 })
  await calleePage.locator('#h:has-text("ready")').waitFor({ timeout: 30_000 })

  // Wait up to 30s for both PCs to reach 'connected'.
  const deadline = Date.now() + 30_000
  while (Date.now() < deadline) {
    const [cs, ss] = await Promise.all([
      callerPage.evaluate(() => window.__pc?.connectionState),
      calleePage.evaluate(() => window.__pc?.connectionState),
    ])
    console.log(`  t=${Math.round((Date.now() - (deadline - 30_000)) / 1000)}s caller=${cs} callee=${ss}`)
    if (cs === 'connected' && ss === 'connected') {
      console.log('  SMOKE PASSED — both PCs connected via Supabase Realtime signaling')
      await browser.close()
      return
    }
    await callerPage.waitForTimeout(1000)
  }

  console.error('FAIL: PCs never reached connected state within 30 s')
  await callerPage.screenshot({ path: 'scripts/screenshots/webrtc-smoke-fail-caller.png' })
  await calleePage.screenshot({ path: 'scripts/screenshots/webrtc-smoke-fail-callee.png' })
  await browser.close()
  process.exit(1)
}

smoke().catch((e) => {
  console.error('FATAL:', e)
  process.exit(1)
})