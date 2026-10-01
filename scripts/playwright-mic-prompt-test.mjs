#!/usr/bin/env node
/**
 * Microphone permission timing test (2026-09-30).
 *
 * Validates the bug fix:
 *   - BEFORE: Web asked for mic permission BEFORE user clicked Accept
 *     (the Stringee SDK triggered getUserMedia at modal mount time).
 *   - AFTER: Web asks for mic permission ONLY AFTER user clicks Accept.
 *
 * We verify by counting permission-state queries and getUserMedia
 * invocations at three lifecycle points:
 *   1. Initial /chat mount
 *   2. IncomingCallWatcher popup appears (still no prompt)
 *   3. After clicking Accept (prompt fires)
 *
 * Uses the production deployment. Bypasses Vercel protection.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { signIn, SUPABASE_URL } from './_lib/auth-context.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_BASE = process.env.API_BASE || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

const results = []
function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail })
  console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail })
  console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`)
  process.exitCode = 1
}
async function shot(page, label) {
  const fname = `mic-${label}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, fname), fullPage: false })
  console.log(`        📸 ${fname}`)
}

async function loginAs(page, email, password) {
  // Sign in via Supabase Auth REST and seed the SSR cookie +
  // localStorage on the page's context. This bypasses the
  // /login form (gated by Vercel SSO in some environments) and
  // lands us already-authenticated.
  const session = await signIn(email, password)
  const projectRef = new URL(SUPABASE_URL).hostname.split('.')[0]
  const storageKey = `sb-${projectRef}-auth-token`
  const value = JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: session.user,
  })
  const encoded = Buffer.from(value, 'utf-8').toString('base64')
  const hostname = new URL(API_BASE).hostname
  await page.context().addCookies([
    {
      name: storageKey,
      value: encoded,
      domain: hostname,
      path: '/',
      sameSite: 'Lax',
    },
  ])
  await page.addInitScript(
    ([key, val]) => {
      try {
        localStorage.setItem(key, val)
      } catch {}
    },
    [storageKey, value],
  )
  await page.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  if (page.url().includes('/login')) {
    throw new Error(
      `loginAs(${email}) failed — context still redirected to /login after seeding auth cookie`,
    )
  }
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const ctxOpts = {
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  }
  // Grant mic permission so the test doesn't get blocked. We're
  // measuring WHEN the code requests it, not whether the user denied.
  const johnCtx = await browser.newContext({ ...ctxOpts, permissions: ['microphone'] })
  const lanCtx = await browser.newContext({ ...ctxOpts, permissions: ['microphone'] })
  const john = await johnCtx.newPage()
  const lan = await lanCtx.newPage()

  await loginAs(john, 'john.doe@example.com', 'password123')
  await loginAs(lan, 'lan.pham@localit.dev', 'password123')

  // Instrument getUserMedia + Permissions.query on BOTH contexts so we
  // can count calls and confirm timing.
  const instrumentScript = `
    window.__micCalls = []
    const origGUM = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices)
    navigator.mediaDevices.getUserMedia = function(...args) {
      window.__micCalls.push({ when: Date.now(), kind: 'getUserMedia', args: JSON.parse(JSON.stringify(args || [])) })
      return origGUM(...args)
    }
    if (navigator.permissions && navigator.permissions.query) {
      const origQ = navigator.permissions.query.bind(navigator.permissions)
      navigator.permissions.query = function(...args) {
        try {
          const name = args[0] && args[0].name
          if (name === 'microphone') {
            window.__micCalls.push({ when: Date.now(), kind: 'permQuery', name })
          }
        } catch {}
        return origQ(...args)
      }
    }
  `

  await john.addInitScript(instrumentScript)
  await lan.addInitScript(instrumentScript)

  // Use stable seed UUID for Lan — auth-cookie lookup is flaky
  // because the Vercel SSO gate sometimes strips the bypass header
  // on top-level navigations.
  const lanId = '11111111-1111-1111-1111-111111111111'

  // 1. Initial /chat mount on John (no calls yet).
  await john.goto(`${API_BASE}/chat?buddy=${lanId}`, { waitUntil: 'domcontentloaded' })
  await john.waitForTimeout(2000)
  const callsAfterMount = await john.evaluate(() => window.__micCalls?.length ?? 0)
  if (callsAfterMount === 0) {
    pass('no-mic-on-mount', 'no getUserMedia / permQuery at /chat mount')
  } else {
    fail('no-mic-on-mount', `${callsAfterMount} mic call(s) on mount`)
  }

  // 2. Lan opens chat, John clicks Phone.
  await lan.goto(`${API_BASE}/chat?caller=john`, { waitUntil: 'domcontentloaded' })
  await lan.waitForTimeout(800)
  // Caller side: click Phone.
  const phoneBtn = john.locator('button[aria-label*="Start voice call"], button[aria-label*="Voice call"]').first()
  await phoneBtn.click({ timeout: 5000 })

  // After clicking Phone, mic prompt should fire (this is the
  // outgoing-call path).
  await john.waitForTimeout(1500)
  const callsAfterPhoneClick = await john.evaluate(() => window.__micCalls?.length ?? 0)
  if (callsAfterPhoneClick > 0) {
    pass('mic-prompt-on-outgoing', `getUserMedia called ${callsAfterPhoneClick} time(s) after Phone click`)
  } else {
    // If the popup hasn't fired yet, the call may have failed to dial.
    // This is also a failure — outgoing must trigger the prompt.
    fail('mic-prompt-on-outgoing', 'no getUserMedia after Phone click')
  }

  await shot(john, 'john-after-phone-click')

  // 3. Lan sees popup, mic should NOT have been called yet on Lan side.
  try {
    await lan.waitForSelector('[role="alertdialog"][aria-label="Incoming voice call"]', {
      timeout: 10000,
    })
  } catch {
    fail('lan-popup-appeared', 'no popup on Lan side')
    return
  }
  pass('lan-popup-appeared', 'incoming call popup visible')

  const callsBeforeAccept = await lan.evaluate(() => window.__micCalls?.length ?? 0)
  if (callsBeforeAccept === 0) {
    pass('no-mic-before-accept', 'no getUserMedia on Lan before clicking Accept')
  } else {
    fail('no-mic-before-accept', `${callsBeforeAccept} mic call(s) on Lan before Accept — bug regressed!`)
  }

  // 4. Lan clicks Accept → now mic should fire on Lan side.
  await lan.locator('button[aria-label="Accept call"]').click()
  await lan.waitForTimeout(2000)

  const callsAfterAccept = await lan.evaluate(() => window.__micCalls?.length ?? 0)
  if (callsAfterAccept > callsBeforeAccept) {
    pass('mic-prompt-on-accept', `getUserMedia fired ${callsAfterAccept - callsBeforeAccept} time(s) after Accept`)
  } else {
    fail('mic-prompt-on-accept', 'no getUserMedia after Accept')
  }

  await shot(lan, 'lan-after-accept')

  // Clean up — end the call.
  try {
    const endBtn = lan.locator('[role="dialog"] button[aria-label="End call"]').first()
    if (await endBtn.count()) await endBtn.click()
    await lan.waitForTimeout(2000)
  } catch {}

  await johnCtx.close()
  await lanCtx.close()
  await browser.close()

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`\n=== Summary: ${passed} passed, ${failed} failed ===`)
  if (failed > 0) {
    console.log('Failures:')
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`  - ${r.name}: ${r.detail}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('FATAL:', err)
  process.exit(2)
})
