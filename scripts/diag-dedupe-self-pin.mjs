#!/usr/bin/env node
// Regression test for the "2 pins for my own position" bug.
// Opens /map as Lan, clicks Share my location, waits for the broadcaster's
// own row to potentially echo back, then counts the rendered markers.
// Expected: exactly 1 self pin (the pulsing one — or a flat "Y" if the
// 1-second old page hasn't picked up the selfGranted state yet).
// Before fix: 2 pins (self marker + echo from postgres_changes).
// After fix:  1 pin.

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

const browser = await chromium.launch({ headless: true, args: ['--use-fake-ui-for-media-stream'] })
const context = await browser.newContext({
  bypassCSP: true,
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  geolocation: { latitude: 16.0544, longitude: 108.2023 },
})
await context.grantPermissions(['geolocation'], { origin: BASE })
await login(context, 'lan.pham@localit.dev', 'password123')

const page = await context.newPage()
await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button:has-text("Share my location")', { timeout: 10000 })
await page.click('button:has-text("Share my location")', { force: true })
// Give the postgres_changes echo time to land. We wait long enough that
// the bug WOULD have shown up if the filter were broken.
await page.waitForTimeout(15000)

const counts = await page.evaluate(() => {
  // All Leaflet markers via the .leaflet-marker-icon class are present.
  // We count distinct icon DOM elements so buddies + self + echoes all
  // surface here. Buddy pins are friends from safe_buddies; self is one
  // (or two, pre-fix) pin at the user's GPS position.
  const all = document.querySelectorAll('.leaflet-marker-icon')
  // Self position. Pull the most recent lat/lng from the MapView's
  // userLocation prop via the live location store? Simpler: count pins
  // that sit within a 1px of the user's known GPS in the rendered
  // marker. Instead we just count ALL markers and assert it doesn't
  // double-count the self pin by checking for two pins with the same
  // screen coords (within 2px tolerance).
  const positions = []
  for (const el of all) {
    const t = el.style.transform || ''
    const m = t.match(/translate3d\(([-\d.]+)px,\s*([-\d.]+)px/)
    if (m) positions.push({ x: parseFloat(m[1]), y: parseFloat(m[2]) })
  }
  // Find clusters of pins at the same x,y (within 2px). Each cluster of
  // size 2+ means duplicate pins at one position.
  const clusters = []
  for (let i = 0; i < positions.length; i++) {
    let cluster = [positions[i]]
    for (let j = i + 1; j < positions.length; j++) {
      if (Math.abs(positions[i].x - positions[j].x) < 2 && Math.abs(positions[i].y - positions[j].y) < 2) {
        cluster.push(positions[j])
      }
    }
    if (cluster.length > 1) clusters.push(cluster)
  }
  return { totalMarkers: all.length, duplicateClusters: clusters.length }
})

await page.screenshot({ path: path.join(SS_DIR, 'dedupe-self-pin.png'), fullPage: false })
await browser.close()

const pass = counts.duplicateClusters === 0
console.log(JSON.stringify(counts, null, 2))
console.log(pass ? 'PASS: no duplicate pins' : 'FAIL: duplicate pin cluster found')
process.exit(pass ? 0 : 1)
