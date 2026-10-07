#!/usr/bin/env node
// Systematic-debugging diagnostic: open /dashboard (or /map) as a logged-in
// user, capture console + page errors over 30s, then count how many times
// bindRealtimeAuth logged (should be 1) and whether any Leaflet "container
// reused" / "_leaflet_pos" errors fired.
//
// Fails loudly if:
//   - bindRealtimeAuth log count > 5 (singleton bug)
//   - any "Map container is being reused by another instance" error
//   - any "_leaflet_pos" TypeError
//   - any "[app] segment error" lines
//
// Usage:
//   node scripts/diag-map-realtime-leak.mjs
//   node scripts/diag-map-realtime-leak.mjs --url /map

import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const TARGET = process.argv.includes('--url=/map')
  ? '/map'
  : process.argv.includes('--url=/dashboard')
  ? '/dashboard'
  : process.argv.find((a) => a.startsWith('--url='))?.slice('--url='.length) || '/dashboard'

const CONSOLE_DLOG_LINES = []
const PAGE_ERRORS = []

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    geolocation: { latitude: 16.0544, longitude: 108.2023 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 800 },
  })
  const page = await ctx.newPage()

  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[dlog]')) CONSOLE_DLOG_LINES.push(text)
    if (text.includes('Realtime send()')) CONSOLE_DLOG_LINES.push(`[warn] ${text}`)
    if (text.startsWith('[app] segment error')) PAGE_ERRORS.push(text)
  })
  page.on('pageerror', (err) => {
    PAGE_ERRORS.push(`pageerror: ${err.message}`)
  })

  // Login first
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  // Now navigate to the target page
  await page.goto(`${BASE}${TARGET}`, { waitUntil: 'domcontentloaded' })
  // Let the page settle + the realtime/leaflet effects fire several times
  await page.waitForTimeout(30_000)

  // Take a screenshot for visual confirmation
  await page.screenshot({
    path: 'scripts/screenshots/diag-map-realtime-leak.png',
    fullPage: false,
  })

  // Count signals
  const bindRealtimeAuthCount = CONSOLE_DLOG_LINES.filter((l) =>
    l.includes('bindRealtimeAuth: setAuth OK'),
  ).length
  const realtimeFallback = CONSOLE_DLOG_LINES.filter((l) => l.includes('Realtime send()')).length
  const containerReuse = PAGE_ERRORS.filter((e) => /Map container is being reused/i.test(e)).length
  const leafletPos = PAGE_ERRORS.filter((e) => /_leaflet_pos/.test(e)).length
  const segmentErrors = PAGE_ERRORS.length

  const report = {
    target: TARGET,
    dlog_total: CONSOLE_DLOG_LINES.length,
    bindRealtimeAuth_calls: bindRealtimeAuthCount,
    realtime_fallback_warnings: realtimeFallback,
    page_errors_total: PAGE_ERRORS.length,
    page_errors: PAGE_ERRORS.slice(0, 5),
    container_reused_count: containerReuse,
    leaflet_pos_undefined_count: leafletPos,
    segment_errors: segmentErrors,
  }
  console.log(JSON.stringify(report, null, 2))

  // Verdicts
  const failed = []
  if (bindRealtimeAuthCount > 5) {
    failed.push(
      `bindRealtimeAuth fired ${bindRealtimeAuthCount}x in 30s — singleton broken`,
    )
  }
  if (containerReuse > 0) {
    failed.push(
      `${containerReuse}x 'Map container is being reused by another instance' — MapDisposer racing react-leaflet`,
    )
  }
  if (leafletPos > 0) {
    failed.push(`${leafletPos}x '_leaflet_pos' TypeError — setView on torn-down map`)
  }
  if (segmentErrors > 0) {
    failed.push(`${segmentErrors}x segment error(s) listed above`)
  }

  if (failed.length > 0) {
    console.error('\nFAIL:')
    for (const f of failed) console.error('  - ' + f)
    process.exitCode = 1
  } else {
    console.log('\nPASS: no realtime leak, no Leaflet errors.')
  }
} finally {
  await browser.close()
}