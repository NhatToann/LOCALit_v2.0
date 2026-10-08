#!/usr/bin/env node
// Capture network failures + Leaflet errors that explain why tile load = 0

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SS_DIR = path.join(import.meta.dirname, 'screenshots')
await mkdir(SS_DIR, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    geolocation: { latitude: 16.0544, longitude: 108.2023 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()
  const requests = []
  const failures = []
  page.on('request', (r) => {
    const url = r.url()
    if (url.includes('tile.openstreetmap.org') || url.includes('leaflet')) {
      requests.push({ url: url.slice(0, 100), method: r.method() })
    }
  })
  page.on('requestfailed', (r) => {
    const url = r.url()
    if (url.includes('tile.openstreetmap.org')) {
      failures.push({ url: url.slice(0, 100), failure: r.failure()?.errorText })
    }
  })
  page.on('response', (r) => {
    const url = r.url()
    if (url.includes('tile.openstreetmap.org')) {
      requests.push({ url: url.slice(0, 100), status: r.status() })
    }
  })
  page.on('pageerror', (e) => console.log('[PAGE ERROR]', e.message))
  page.on('console', (m) => {
    const t = m.text()
    if (t.includes('leaflet') || t.includes('tile') || t.includes('Leaflet') || m.type() === 'error') {
      console.log('[console.' + m.type() + ']', t.slice(0, 200))
    }
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await page.waitForURL('**/dashboard', { timeout: 10000 })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })
  // Wait LONG enough for tiles to load
  await page.waitForTimeout(8000)

  // Check tile states now
  const tileState = await page.evaluate(() => {
    const tiles = document.querySelectorAll('.leaflet-tile')
    const states = { loading: 0, loaded: 0, error: 0, other: 0 }
    const sampleLoaded = []
    const sampleError = []
    for (const t of tiles) {
      if (t.classList.contains('leaflet-tile-loaded')) { states.loaded++; if (sampleLoaded.length < 2) sampleLoaded.push(t.getAttribute('src')?.slice(-30)) }
      else if (t.classList.contains('leaflet-tile-loading')) { states.loading++ }
      else if (t.classList.contains('leaflet-tile-error')) { states.error++; if (sampleError.length < 2) sampleError.push(t.getAttribute('src')?.slice(-30)) }
      else { states.other++ }
    }
    return { total: tiles.length, states, sampleLoaded, sampleError }
  })

  // Click the + button and observe
  await page.locator('.leaflet-control-zoom-in').first().click()
  await page.waitForTimeout(3000)
  const afterZoomState = await page.evaluate(() => {
    const tiles = document.querySelectorAll('.leaflet-tile')
    return { total: tiles.length, loaded: document.querySelectorAll('.leaflet-tile-loaded').length }
  })

  await page.screenshot({ path: path.join(SS_DIR, 'diag-map-network.png'), fullPage: false })

  console.log('\n=== Network requests for tiles ===')
  console.log(JSON.stringify(requests.slice(0, 20), null, 2))
  console.log('\n=== Network failures ===')
  console.log(JSON.stringify(failures, null, 2))
  console.log('\n=== Tile state after 8s ===')
  console.log(JSON.stringify(tileState, null, 2))
  console.log('\n=== After zoom click ===')
  console.log(JSON.stringify(afterZoomState, null, 2))
} finally {
  await browser.close()
}