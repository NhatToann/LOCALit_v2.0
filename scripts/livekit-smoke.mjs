/**
 * Smoke test for the new LiveKit voice-call flow.
 *
 * Verifies:
 *   1. Sign in as John (tourist)
 *   2. POST /api/livekit/token with a fake roomName -- should return
 *      a token + wsUrl
 *   3. Sign in as Lan (buddy) and mint a token for the same room
 *   4. Decode both tokens to confirm identity matches the user and
 *      room grant is correct
 *
 * This does NOT exercise an actual audio call (that requires
 * Playwright + two browser contexts with mic permissions). It's a
 * server-side smoke test.
 */
import { chromium } from 'playwright'

// Use the hash URL directly — Vercel Deployment Protection on the
// canonical alias (localit-nhattoann.vercel.app) gates unauthenticated
// visitors to the Vercel SSO login. The hash URL bypasses that for
// previews and tests. See AGENTS.md "Vercel Deployment Protection".
const PROD = process.env.LOCALIT_PROD_URL || 'https://localit-j0ejx2ruy-nhattoann.vercel.app'
// Header that skips the SSO gate. Set in Vercel project → Deployment
// Protection → "Protection Bypass for Automation".
const BYPASS_HEADER = { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' }

async function signIn(page, email, password) {
  await page.goto(PROD + '/login', { waitUntil: 'networkidle' })
  // Diagnostic: log the page URL + body length + first input selector
  // so a future test failure shows what actually loaded.
  var diag = await page.evaluate(function () {
    return {
      url: location.href,
      title: document.title,
      bodyLen: document.body ? document.body.innerHTML.length : 0,
      inputCount: document.querySelectorAll('input').length,
    }
  })
  console.log('  page diag:', JSON.stringify(diag))
  // Wait for hydration to render the form.
  await page.waitForFunction(
    function () {
      var inputs = document.querySelectorAll('input')
      return inputs.length >= 2
    },
    { timeout: 30000 },
  )
  // Use id selectors (login page uses id=email and id=password).
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(function (url) { return !url.pathname.startsWith('/login') }, {
    timeout: 30000,
  })
}

async function mintToken(page, roomName) {
  const resp = await page.evaluate(async function (args) {
    // Diagnostic: capture auth source so we can debug 401s.
    var cookieName = 'sb-pqvnjgyqbxlylawwogjv-auth-token'
    var cookieRaw = null
    document.cookie.split(';').forEach(function (kv) {
      var idx = kv.indexOf('=')
      var k = idx >= 0 ? kv.slice(0, idx).trim() : kv.trim()
      if (k === cookieName) cookieRaw = kv.slice(idx + 1).trim()
    })
    var storageToken = null
    try {
      var raw = localStorage.getItem('sb-pqvnjgyqbxlylawwogjv-auth-token')
      if (raw) {
        var parsed = JSON.parse(raw)
        storageToken = parsed.access_token || null
      }
    } catch (e) {}
    var r = await fetch('/api/livekit/token', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ roomName: args.roomName }),
    })
    var text = await r.text()
    return {
      status: r.status,
      body: text,
      diag: {
        hasCookieRaw: !!cookieRaw,
        cookieRawLen: cookieRaw ? cookieRaw.length : 0,
        cookieRawPrefix: cookieRaw ? cookieRaw.slice(0, 12) : null,
        hasStorageToken: !!storageToken,
        storageTokenPrefix: storageToken ? storageToken.slice(0, 20) : null,
      },
    }
  }, { roomName: roomName })
  console.log('  token resp:', resp.status, 'cookie/storage:', JSON.stringify(resp.diag))
  if (resp.status !== 200) {
    throw new Error('token mint failed: ' + resp.status + ' ' + resp.body)
  }
  const body = JSON.parse(resp.body)
  if (!body.token || !body.wsUrl || !body.identity) {
    throw new Error('token response missing fields: ' + JSON.stringify(body))
  }
  return body
}

function decodeJwt(token) {
  const parts = token.split('.')
  if (parts.length !== 3) throw new Error('malformed JWT')
  const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/')
  const padded = payload + '='.repeat((4 - (payload.length % 4)) % 4)
  return JSON.parse(Buffer.from(padded, 'base64').toString('utf-8'))
}

;(async () => {
  const browser = await chromium.launch({ headless: true })
  const johnCtx = await browser.newContext({ extraHTTPHeaders: BYPASS_HEADER })
  const johnPage = await johnCtx.newPage()

  try {
    console.log('-> Sign in as John (tourist)')
    await signIn(johnPage, 'john.doe@example.com', 'password123')

    console.log('-> John mints a LiveKit token')
    const roomName = 'call:00000000-0000-0000-0000-000000000001'
    const john = await mintToken(johnPage, roomName)
    const johnClaims = decodeJwt(john.token)
    console.log('  wsUrl:', john.wsUrl)
    console.log('  identity:', john.identity)
    console.log('  jwt.room:', johnClaims.room)
    console.log('  jwt.sub:', johnClaims.sub)

    if (john.wsUrl !== 'wss://localit-tntjqmfu.livekit.cloud') {
      throw new Error('wsUrl mismatch: ' + john.wsUrl)
    }
    if (johnClaims.room !== roomName) {
      throw new Error('token room grant mismatch')
    }
    if (johnClaims.sub !== john.identity) {
      throw new Error('token sub != identity')
    }

    console.log('-> Sign in as Lan (buddy) in second context')
    const lanCtx = await browser.newContext({ extraHTTPHeaders: BYPASS_HEADER })
    const lanPage = await lanCtx.newPage()
    await signIn(lanPage, 'lan.pham@localit.dev', 'password123')

    console.log('-> Lan mints a LiveKit token for the same room')
    const lan = await mintToken(lanPage, roomName)
    const lanClaims = decodeJwt(lan.token)
    console.log('  identity:', lan.identity)
    console.log('  jwt.room:', lanClaims.room)

    if (lan.identity === john.identity) {
      throw new Error('expected different identities for two users')
    }
    if (lanClaims.room !== roomName) {
      throw new Error('Lan token room mismatch')
    }

    console.log('')
    console.log('PASS LiveKit token smoke test')
  } catch (e) {
    console.error('')
    console.error('FAIL LiveKit token smoke test')
    console.error(e)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
