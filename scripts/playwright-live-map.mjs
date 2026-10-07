#!/usr/bin/env node
// Live map 2-device test: open 2 browsers, both share location, both should
// see the other's marker in the DOM. We use react-leaflet markers; the
// "live-" prefix on the L.marker key gives us a stable DOM-attached
// hook to count peers.

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SS_DIR = path.join(import.meta.dirname, 'screenshots')

await mkdir(SS_DIR, { recursive: true })

async function login(context, email, password) {
  const page = await context.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#email')
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await page.close()
}

async function openMap(context, label, peerExpected) {
  const page = await context.newPage()
  await context.grantPermissions(['geolocation'], { origin: BASE })
  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
  // Wait for the share button.
  await page.waitForSelector('button:has-text("Share my location")', { timeout: 10000 })
  await page.click('button:has-text("Share my location")')
  // Wait for broadcasts to flow (longer to give WS handshake time).
  await page.waitForTimeout(20000)
  const status = await page.evaluate(() => {
    const text = document.body.innerText
    const sharing = /Sharing your live location/i.test(text) || /Sharing live/i.test(text)
    const peerMatch = text.match(/(\d+) live tourist/)
    const peerCount = peerMatch ? parseInt(peerMatch[1], 10) : 0
    // Live markers render as Leaflet divIcons with class "localit-marker"
    // containing "localit-marker-pin". Count the ones that are NOT our self.
    const allMarkers = document.querySelectorAll('.localit-marker')
    return { sharing, peerCount, totalMarkers: allMarkers.length }
  })
  await page.screenshot({ path: path.join(SS_DIR, `livemap-${label}.png`), fullPage: false })
  await page.close()
  return { label, ...status }
}

const browser = await chromium.launch({ headless: true })
try {
  const ctxOpts = { extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS } }
  const userA = await browser.newContext({
    ...ctxOpts,
    geolocation: { latitude: 16.0544, longitude: 108.2023 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 720 },
  })
  const userB = await browser.newContext({
    ...ctxOpts,
    geolocation: { latitude: 16.0600, longitude: 108.2200 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 720 },
  })

  // Login both. Use the buddy account for A (lan.pham) and tourist for B (john).
  await login(userA, 'lan.pham@localit.dev', 'password123')
  await login(userB, 'john.doe@example.com', 'password123')

  // Open maps in parallel — both sharing should make both see one peer each.
  const [a, b] = await Promise.all([openMap(userA, 'A'), openMap(userB, 'B')])
  console.log(JSON.stringify({ A: a, B: b }, null, 2))
  console.log(`A sees B as peer: ${a.peerCount >= 1 ? 'YES' : 'NO'}`)
  console.log(`B sees A as peer: ${b.peerCount >= 1 ? 'YES' : 'NO'}`)
} finally {
  await browser.close()
}