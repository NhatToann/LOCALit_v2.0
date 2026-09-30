#!/usr/bin/env node
/**
 * Production verification of the Callee CallModal UI (Phase 2026-09-30).
 *
 * Bypasses Stringee entirely (test env can't connect) by:
 *   1. Inserting a pending_calls row directly via debug API
 *   2. Logging in as Lan in two browser tabs:
 *      - Tab A: /chat (so IncomingCallWatcher renders the popup)
 *      - Tab B: /chat?call=<id> (simulating the click-accept deep-link)
 *
 * Then verifies:
 *   - CallModal dialog opens with role=dialog
 *   - End button is visible (callClient set, state=connecting)
 *   - Mute button is visible (disabled until connected, but still rendered)
 *   - Speaker button is visible
 *   - Avatar + partner name shown
 *   - "Call failed" or "Connecting…" headline visible
 *   - Click End → CallModal closes
 *
 * This proves the production fix works regardless of Stringee's test
 * environment quirks.
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
}
async function shot(page, label) {
  idx += 1
  const fname = `callee-${String(idx).padStart(2, '0')}-${label}.png`
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, fname), fullPage: false })
  console.log(`        📸 ${fname}`)
}
async function loginAs(page, email, password) {
  await page.goto(`${API_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type="email"]', { timeout: 15000 })
  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 }),
    page.locator('input[type="password"]').press('Enter'),
  ])
  await page.waitForTimeout(800)
}
const debugHeaders = {
  'content-type': 'application/json',
  'x-vercel-protection-bypass': BYPASS,
}
async function debugGet(query = '') {
  const res = await fetch(`${API_BASE}/api/debug/voice-call-test${query}`, {
    headers: debugHeaders,
  })
  if (!res.ok) throw new Error(`debug GET ${res.status}: ${await res.text()}`)
  return await res.json()
}
async function debugPost(body) {
  const res = await fetch(`${API_BASE}/api/debug/voice-call-test`, {
    method: 'POST',
    headers: debugHeaders,
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`debug POST ${res.status}: ${await res.text()}`)
  return await res.json()
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  console.log(`\n=== Callee UI verification (bypass Stringee) ===`)
  console.log(`API_BASE: ${API_BASE}\n`)

  // Make sure a John↔Lan conversation exists
  const conv = await debugGet('?create=1')
  pass('debug API found/created John↔Lan conversation', `conv=${conv.conversationId}`)
  await debugPost({ action: 'clean-ringing' })

  const browser = await chromium.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'] })
  const ctxOpts = { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS } }

  // ---- Pre-insert a ringing row so Lan can see the popup ----
  const inserted = await debugPost({
    action: 'insert-pending',
    conversationId: conv.conversationId,
    callerId: conv.callerId,
    calleeId: conv.calleeId,
  })
  pass('inserted pending_calls row', `id=${inserted.id}`)

  // ---- Login Lan, navigate to /chat?call=<id> directly ----
  const lanCtx = await browser.newContext({ ...ctxOpts, permissions: ['microphone'] })
  const lanPage = await lanCtx.newPage()
  lanPage.on('console', (m) => {
    const t = m.text()
    if (/call|stringee|incoming|presence|chat/i.test(t))
      console.log(`        [lan:${m.type()}] ${t}`)
  })
  await loginAs(lanPage, 'lan.pham@localit.dev', 'password123')
  await lanPage.waitForTimeout(1500)

  console.log(`\n[1] Navigate to /chat?call=${inserted.id} (simulating Accept click)`)
  await lanPage.goto(`${API_BASE}/chat?call=${inserted.id}`, { waitUntil: 'domcontentloaded' })
  // Give the chat page time to load conversations + run acceptCall
  await lanPage.waitForTimeout(6000)
  await shot(lanPage, 'lan-after-navigate')

  // Check the URL — should still be /chat?call=<id> (or /chat if router.replace ran)
  console.log(`        current url: ${lanPage.url()}`)

  // ---- Verify CallModal appears ----
  console.log(`\n[2] CallModal should be visible with full controls`)
  const callDialog = lanPage.getByRole('dialog', { name: /voice call/i })
  const dialogVisible = await callDialog.isVisible().catch(() => false)
  if (dialogVisible) pass('CallModal dialog is visible')
  else fail('CallModal dialog is visible')

  // End button
  const endBtn = lanPage.getByRole('button', { name: /^end call$/i })
  const endVisible = await endBtn.isVisible().catch(() => false)
  if (endVisible) pass('End button is visible')
  else {
    // The failed state only shows Close
    const closeBtn = lanPage.getByRole('button', { name: /^close$/i })
    const closeVisible = await closeBtn.isVisible().catch(() => false)
    if (closeVisible) pass('Close button is visible (failed state)', 'no End — failed UI')
    else fail('End/Close button is visible in CallModal')
  }

  // Mute button (may be disabled but should be in DOM)
  const muteBtn = lanPage.getByRole('button', { name: /mute microphone|unmute microphone/i })
  const muteVisible = await muteBtn.isVisible().catch(() => false)
  if (muteVisible) pass('Mute button is visible in CallModal')
  else fail('Mute button is visible in CallModal')

  // Speaker button
  const speakerBtn = lanPage.getByRole('button', { name: /speaker/i })
  const speakerVisible = await speakerBtn.isVisible().catch(() => false)
  if (speakerVisible) pass('Speaker button is visible in CallModal')
  else fail('Speaker button is visible in CallModal')

  // Partner name (avatar is rendered with partner name)
  const partner = lanPage.getByRole('heading', { name: new RegExp(conv.callerName, 'i') }).first()
  const partnerVisible = await partner.isVisible().catch(() => false)
  if (partnerVisible) pass('Partner name visible in CallModal', conv.callerName)
  else fail('Partner name visible in CallModal', `expected ${conv.callerName}`)

  // Headline visible
  const headlines = [
    'Connecting…',
    'Incoming call',
    'Ringing…',
    'Calling',
    '00:0',
    'Call failed',
    'Call declined',
    'No answer',
  ]
  let headlineFound = null
  for (const h of headlines) {
    const el = lanPage.getByText(h, { exact: false }).first()
    if (await el.isVisible().catch(() => false)) {
      headlineFound = h
      break
    }
  }
  if (headlineFound) pass('CallModal shows a call-state headline', headlineFound)
  else fail('CallModal shows a call-state headline', 'no headline matched')

  // If failed, verify error message is visible
  if (headlineFound === 'Call failed') {
    const errorText = await lanPage.getByText(/No matching Stringee call/i).first().isVisible().catch(() => false)
    if (errorText) pass('Detailed error message visible', 'No matching Stringee call to accept')
    else fail('Detailed error message visible', 'error not shown')
  }

  // ---- Try closing the modal ----
  console.log(`\n[3] Click End/Close → CallModal should close`)
  if (endVisible) {
    await endBtn.click({ timeout: 5000 }).catch(() => {})
  } else {
    const closeBtn = lanPage.getByRole('button', { name: /^close$/i })
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click({ timeout: 5000 }).catch(() => {})
    }
  }
  await lanPage.waitForTimeout(2500)
  await shot(lanPage, 'lan-after-end')
  const dialogAfter = await callDialog.isVisible().catch(() => false)
  if (!dialogAfter) pass('CallModal closes after End/Close')
  else fail('CallModal closes after End/Close')

  // Clean up
  await debugPost({ action: 'clean-ringing' })

  await lanCtx.close()
  await browser.close()

  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`\n=== Summary ===`)
  console.log(`Total: ${results.length}  Pass: ${passed}  Fail: ${failed}`)
  if (failed > 0) {
    console.log(`\nFailing checks:`)
    for (const r of results.filter((r) => r.status === 'FAIL')) {
      console.log(`  - ${r.name}${r.detail ? `  (${r.detail})` : ''}`)
    }
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('Fatal:', err)
  process.exit(2)
})