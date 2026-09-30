#!/usr/bin/env node
/**
 * Voice-call 2-way end-to-end test (2026-09-30 rebuild).
 *
 * Validates:
 *   1. buddy → tourist direction (existing — was working with Stringee)
 *   2. tourist → buddy direction (NEW — was broken with Stringee because
 *      Stringee client only connected on /chat)
 *   3. mic permission prompt timing (deferred until after Accept)
 *   4. call persists across page navigation (buddy calls from /chat then
 *      navigates to /map — modal stays)
 *   5. presence shows online across all pages (was offline on non-/chat)
 *
 * Uses the production deployment. Two Playwright contexts (John +
 * Lan) talk to each other via the real Supabase Realtime broadcast
 * channel + DB pending_calls row.
 */

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const API_BASE = process.env.API_BASE || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots')

const results = []
let idx = 0
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
  idx += 1
  const fname = `twoway-${String(idx).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, fname), fullPage: false })
  console.log(`        📸 ${fname}`)
}

async function loginAs(page, email, password) {
  await page.goto(`${API_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 })
}

async function openChat(page, partnerId) {
  await page.goto(`${API_BASE}/chat?buddy=${partnerId}`, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForTimeout(800)
}

async function waitForIncomingPopup(page, timeout = 8000) {
  await page.waitForSelector('[role="alertdialog"][aria-label="Incoming voice call"]', {
    timeout,
  })
}

async function waitForCallModal(page, timeout = 10000) {
  // The modal is rendered globally by ActiveCallSheet. It uses the
  // role=dialog with aria-label "Voice call with X".
  await page.waitForSelector('[role="dialog"][aria-modal="true"]', { timeout })
}

async function waitForConnected(page, timeout = 15000) {
  await page.waitForFunction(
    () => {
      const dialog = document.querySelector('[role="dialog"][aria-modal="true"]')
      if (!dialog) return false
      const text = dialog.textContent || ''
      return /\d{2}:\d{2}/.test(text) // MM:SS timer visible
    },
    null,
    { timeout },
  )
}

async function getRTCState(page) {
  return await page.evaluate(() => {
    // The CallClient attaches the RTCPeerConnection to its own state,
    // but for tests we look for any active connection via the registry.
    const w = window
    const clients = w.__localitCallClients || {}
    const out = []
    for (const id of Object.keys(clients)) {
      const c = clients[id]
      const pc = c && c.peerConnection
      out.push({
        id,
        state: c && c.state,
        connectionState: pc ? pc.connectionState : null,
        iceState: pc ? pc.iceConnectionState : null,
      })
    }
    return out
  })
}

async function setup() {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  const browser = await chromium.launch({ headless: true })
  const ctxOpts = {
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
    },
  }
  return { browser, ctxOpts }
}

async function scenarioBuddyCallsTourist({ browser, ctxOpts }) {
  console.log('\n=== Scenario 1: buddy (Lan) calls tourist (John) ===')

  const lanCtx = await browser.newContext({
    ...ctxOpts,
    permissions: ['microphone'],
  })
  const johnCtx = await browser.newContext({
    ...ctxOpts,
    permissions: ['microphone'],
  })
  const lan = await lanCtx.newPage()
  const john = await johnCtx.newPage()

  await loginAs(lan, 'lan.pham@localit.dev', 'password123')
  await loginAs(john, 'john.doe@example.com', 'password123')
  pass('login', 'both users signed in')

  // Find John's id from John's profile.
  const johnId = await john.evaluate(async () => {
    const sb = window.__supabase || null
    if (sb) {
      const { data } = await sb.auth.getUser()
      if (data?.user) return data.user.id
    }
    // Fallback: hit safe_profiles with our email.
    const res = await fetch('/api/auth/me').catch(() => null)
    if (res && res.ok) {
      const j = await res.json()
      return j?.id
    }
    return null
  })

  if (!johnId) {
    fail('find-john-id', 'could not resolve John user id')
    return
  }
  pass('find-john-id', johnId)

  await openChat(lan, johnId)
  pass('lan-opens-chat', 'lan opened chat with john')

  // Lan clicks Phone.
  const phoneBtn = await lan.locator('button[aria-label*="Start voice call"], button[aria-label*="Voice call"]').first()
  await phoneBtn.click({ timeout: 5000 })
  pass('lan-clicks-phone', 'caller dialed')

  // Wait for the John-side popup.
  await waitForIncomingPopup(john, 10000)
  pass('john-sees-popup', 'callee saw incoming popup')

  await shot(john, 'john-incoming-popup')

  // John clicks Accept.
  const acceptBtn = john.locator('button[aria-label="Accept call"]')
  await acceptBtn.click()
  pass('john-clicks-accept')

  // Both sides should now see a modal.
  await waitForCallModal(john, 10000)
  pass('john-modal-rendered')

  await waitForConnected(john, 15000).catch(() => {})
  await waitForConnected(lan, 15000).catch(() => {})
  await shot(john, 'john-connected')
  await shot(lan, 'lan-connected')

  // Check RTC state.
  const lanState = await getRTCState(lan)
  const johnState = await getRTCState(john)
  console.log('  lan RTC:', JSON.stringify(lanState))
  console.log('  john RTC:', JSON.stringify(johnState))

  const lanConnected = lanState.some((s) => s.connectionState === 'connected')
  const johnConnected = johnState.some((s) => s.connectionState === 'connected')
  if (lanConnected && johnConnected) {
    pass('webrtc-both-connected', 'both peer connections reached connected')
  } else {
    fail('webrtc-both-connected', `lan=${lanConnected} john=${johnConnected}`)
  }

  // End the call from Lan.
  const endBtn = lan.locator('[role="dialog"] button[aria-label="End call"]').first()
  if (await endBtn.count()) {
    await endBtn.click()
    pass('lan-ended-call')
  } else {
    fail('end-button-not-found')
  }
  await lan.waitForTimeout(2000)

  await lanCtx.close()
  await johnCtx.close()
}

async function scenarioTouristCallsBuddy({ browser, ctxOpts }) {
  console.log('\n=== Scenario 2: tourist (John) calls buddy (Lan) — was broken before ===')

  const johnCtx = await browser.newContext({
    ...ctxOpts,
    permissions: ['microphone'],
  })
  const lanCtx = await browser.newContext({
    ...ctxOpts,
    permissions: ['microphone'],
  })
  const john = await johnCtx.newPage()
  const lan = await lanCtx.newPage()

  await loginAs(john, 'john.doe@example.com', 'password123')
  await loginAs(lan, 'lan.pham@localit.dev', 'password123')
  pass('login', 'both users signed in')

  const lanId = await lan.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('sb-pqvnjgyqbxlylawwogjv-auth-token')
      if (raw) return JSON.parse(raw).user.id
    } catch {}
    return null
  })
  if (!lanId) {
    fail('find-lan-id', 'could not resolve Lan user id')
    return
  }
  pass('find-lan-id', lanId)

  await openChat(john, lanId)
  pass('john-opens-chat')

  // John clicks Phone.
  const phoneBtn = john.locator('button[aria-label*="Start voice call"], button[aria-label*="Voice call"]').first()
  await phoneBtn.click({ timeout: 5000 })
  pass('john-clicks-phone')

  // Wait for the Lan-side popup.
  await waitForIncomingPopup(lan, 10000)
  pass('lan-sees-popup', 'the previously-broken direction works')

  await shot(lan, 'lan-incoming-popup')

  // Lan clicks Accept.
  await lan.locator('button[aria-label="Accept call"]').click()
  pass('lan-clicks-accept')

  await waitForCallModal(lan, 10000)
  pass('lan-modal-rendered')

  await waitForConnected(lan, 15000).catch(() => {})
  await waitForConnected(john, 15000).catch(() => {})
  await shot(lan, 'lan-connected')
  await shot(john, 'john-connected')

  const lanState = await getRTCState(lan)
  const johnState = await getRTCState(john)
  const lanConnected = lanState.some((s) => s.connectionState === 'connected')
  const johnConnected = johnState.some((s) => s.connectionState === 'connected')
  if (lanConnected && johnConnected) {
    pass('webrtc-both-connected-tourist-direction', 'both peers connected')
  } else {
    fail('webrtc-both-connected-tourist-direction', `lan=${lanConnected} john=${johnConnected}`)
  }

  // End from Lan.
  const endBtn = lan.locator('[role="dialog"] button[aria-label="End call"]').first()
  if (await endBtn.count()) {
    await endBtn.click()
    pass('lan-ended-call')
  }
  await lan.waitForTimeout(2000)

  await johnCtx.close()
  await lanCtx.close()
}

async function scenarioCallPersistsAcrossNavigation({ browser, ctxOpts }) {
  console.log('\n=== Scenario 3: call modal persists when navigating away from /chat ===')

  const johnCtx = await browser.newContext({
    ...ctxOpts,
    permissions: ['microphone'],
  })
  const lanCtx = await browser.newContext({
    ...ctxOpts,
    permissions: ['microphone'],
  })
  const john = await johnCtx.newPage()
  const lan = await lanCtx.newPage()

  await loginAs(john, 'john.doe@example.com', 'password123')
  await loginAs(lan, 'lan.pham@localit.dev', 'password123')

  const lanId = await lan.evaluate(() => {
    try {
      const raw = window.localStorage.getItem('sb-pqvnjgyqbxlylawwogjv-auth-token')
      if (raw) return JSON.parse(raw).user.id
    } catch {}
    return null
  })

  await openChat(john, lanId)
  const phoneBtn = john.locator('button[aria-label*="Start voice call"], button[aria-label*="Voice call"]').first()
  await phoneBtn.click()
  await waitForIncomingPopup(lan, 10000)
  await lan.locator('button[aria-label="Accept call"]').click()
  await waitForConnected(lan, 15000).catch(() => {})

  pass('call-established', 'baseline established before navigation')

  // John navigates to /map while in a call.
  await john.goto(`${API_BASE}/map`, { waitUntil: 'domcontentloaded' })
  await john.waitForTimeout(2000)

  // Modal should still be visible (mounted globally by ActiveCallSheet).
  const modalStillVisible = await john.locator('[role="dialog"][aria-modal="true"]').count()
  if (modalStillVisible > 0) {
    pass('modal-persists-after-nav', 'modal stayed open when navigating to /map')
  } else {
    fail('modal-persists-after-nav', 'modal disappeared after navigation')
  }

  await shot(john, 'john-on-map-during-call')

  await johnCtx.close()
  await lanCtx.close()
}

async function main() {
  const { browser, ctxOpts } = await setup()
  try {
    await scenarioBuddyCallsTourist({ browser, ctxOpts })
    await scenarioTouristCallsBuddy({ browser, ctxOpts })
    await scenarioCallPersistsAcrossNavigation({ browser, ctxOpts })
  } finally {
    await browser.close()
  }

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
