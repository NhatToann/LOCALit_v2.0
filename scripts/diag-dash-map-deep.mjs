#!/usr/bin/env node
// Take a screenshot of the dashboard map and inspect actual rendered tile positions

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
  page.on('console', (m) => console.log('[console.' + m.type() + ']', m.text()))
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])
  await page.waitForURL('**/dashboard', { timeout: 10000 })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })
  await page.waitForTimeout(3000)

  // Click share to enable
  const shareBtn = await page.locator('button:has-text("Share my location")').first()
  if (await shareBtn.count() > 0) await shareBtn.click()
  await page.waitForTimeout(2000)

  // Scroll the map into view
  await page.evaluate(() => {
    const m = document.querySelector('.leaflet-container')
    m?.scrollIntoView({ block: 'center' })
  })
  await page.waitForTimeout(500)
  await page.screenshot({ path: path.join(SS_DIR, 'diag-dash-map-before-zoom.png'), fullPage: false })

  // Inspect mapPane and tilePane computed style + getBoundingClientRect
  const layout = await page.evaluate(() => {
    const c = document.querySelector('.leaflet-container')
    const mp = c?.querySelector('.leaflet-map-pane')
    const tp = c?.querySelector('.leaflet-tile-pane')
    const layers = c?.querySelector('.leaflet-layer')
    if (!c || !mp || !tp) return null
    return {
      container: {
        rect: c.getBoundingClientRect(),
        position: window.getComputedStyle(c).position,
        overflow: window.getComputedStyle(c).overflow,
      },
      mapPane: {
        rect: mp.getBoundingClientRect(),
        position: window.getComputedStyle(mp).position,
        transform: mp.style.transform,
        zIndex: window.getComputedStyle(mp).zIndex,
      },
      tilePane: {
        rect: tp.getBoundingClientRect(),
        position: window.getComputedStyle(tp).position,
        zIndex: window.getComputedStyle(tp).zIndex,
        childCount: tp.children.length,
      },
      layer: layers ? {
        rect: layers.getBoundingClientRect(),
        position: window.getComputedStyle(layers).position,
        childCount: layers.children.length,
        firstChildTransform: layers.children[0]?.style?.transform,
        firstChildSrc: layers.children[0]?.getAttribute('src')?.slice(0, 80),
      } : null,
      // Check for any event-handler swallowing
      hasMapEvents: typeof c._leaflet_id !== 'undefined',
      mapInstance: (() => {
        // Try to find the L.Map instance via the _leaflet_id key
        const id = c._leaflet_id
        return { id }
      })(),
    }
  })

  console.log('=== Layout ===')
  console.log(JSON.stringify(layout, null, 2))

  // Try direct API call via window
  const apiCheck = await page.evaluate(() => {
    // The map instance is stored on the container as _leaflet_id; to call
    // methods we'd need to use a ref. Instead just call
    // window.dispatchEvent to test wheel handlers
    const c = document.querySelector('.leaflet-container')
    if (!c) return null
    const beforeTiles = c.querySelectorAll('.leaflet-tile').length
    // Trigger a wheel event programmatically
    c.dispatchEvent(new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true }))
    return { beforeTiles, dispatchable: true }
  })
  console.log('\n=== API check ===', JSON.stringify(apiCheck))

  await page.waitForTimeout(2000)
  await page.screenshot({ path: path.join(SS_DIR, 'diag-dash-map-after-wheel.png'), fullPage: false })
} finally {
  await browser.close()
}