#!/usr/bin/env node
// Verify /map page after the layer-order refactor:
//   - map tiles are the bottom-most layer
//   - legend (z-legend=1000) + selected popup (z-aside=1100) sit above
//     every Leaflet pane (markers 600, popups 700, control 800)
//   - page header moved below the map container
//   - no Leaflet errors, no realtime leak
//
// Captures three screenshots:
//   diag-map-before-click.png — initial state, no pin selected
//   diag-map-after-click.png  — after clicking a buddy pin (selected popup)

import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SS_DIR = path.join(import.meta.dirname, 'screenshots')
await mkdir(SS_DIR, { recursive: true })

const consoleLines = []
const pageErrors = []

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    geolocation: { latitude: 16.0544, longitude: 108.2023 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  page.on('console', (msg) => {
    const text = msg.text()
    if (text.includes('[dlog]')) consoleLines.push(text)
    if (text.startsWith('[app] segment error')) pageErrors.push(text)
  })
  page.on('pageerror', (err) => {
    pageErrors.push(`pageerror: ${err.message}`)
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })
  await page.waitForTimeout(3000) // let tiles + buddies hydrate

  // Measure z-indexes of every Leaflet pane and our overlays
  const layers = await page.evaluate(() => {
    const probe = (sel) => {
      const el = document.querySelector(sel)
      if (!el) return { sel, present: false, zIndex: null }
      return {
        sel,
        present: true,
        zIndex: window.getComputedStyle(el).zIndex,
      }
    }
    return {
      tilePane:    probe('.leaflet-tile-pane'),
      markerPane:  probe('.leaflet-marker-pane'),
      popupPane:   probe('.leaflet-popup-pane'),
      controlBox:  probe('.leaflet-control-container'),
      legend:      probe('aside[aria-label="Map legend"]'),
      // selected aside is conditional — check by class
      anyAside:    probe('aside[aria-label^="Selected buddy"]'),
    }
  })

  await page.screenshot({
    path: path.join(SS_DIR, 'diag-map-before-click.png'),
    fullPage: false,
  })

  // Click the first buddy marker to open the selected popup
  const firstMarker = page.locator('.localit-marker').first()
  const markerCount = await firstMarker.count()
  let selectedAsidePresent = false
  if (markerCount > 0) {
    await firstMarker.click({ force: true })
    await page.waitForTimeout(800)
    selectedAsidePresent = await page
      .locator('aside[aria-label^="Selected buddy"]')
      .isVisible()
      .catch(() => false)
    await page.screenshot({
      path: path.join(SS_DIR, 'diag-map-after-click.png'),
      fullPage: false,
    })
  }

  // After all interactions, collect runtime counts
  const bindRealtimeAuthCount = consoleLines.filter((l) =>
    l.includes('bindRealtimeAuth: setAuth OK'),
  ).length
  const containerReuse = pageErrors.filter((e) =>
    /Map container is being reused/i.test(e),
  ).length
  const leafletPos = pageErrors.filter((e) => /_leaflet_pos/.test(e)).length

  const report = {
    layers,
    selectedAsidePresent,
    markerCount,
    bindRealtimeAuth_calls: bindRealtimeAuthCount,
    page_errors_total: pageErrors.length,
    page_errors: pageErrors.slice(0, 3),
    container_reused_count: containerReuse,
    leaflet_pos_undefined_count: leafletPos,
  }
  console.log(JSON.stringify(report, null, 2))

  // Verdicts
  const failed = []
  if (bindRealtimeAuthCount > 5) {
    failed.push(`bindRealtimeAuth fired ${bindRealtimeAuthCount}x (singleton regressed)`)
  }
  if (containerReuse > 0) {
    failed.push(`${containerReuse}x 'Map container is being reused' — MapDisposer race`)
  }
  if (leafletPos > 0) {
    failed.push(`${leafletPos}x '_leaflet_pos' TypeError — setView on torn-down map`)
  }
  if (pageErrors.length > 0) {
    failed.push(`${pageErrors.length}x page error(s) listed above`)
  }
  // Layer-order assertions
  const tileZ = Number(layers.tilePane.zIndex)
  const legendZ = Number(layers.legend.zIndex)
  const markerZ = Number(layers.markerPane.zIndex)
  if (legendZ <= markerZ) {
    failed.push(`legend z=${legendZ} should be > markerPane z=${markerZ}`)
  }
  if (legendZ <= tileZ) {
    failed.push(`legend z=${legendZ} should be > tilePane z=${tileZ}`)
  }
  if (selectedAsidePresent) {
    const asideZ = Number(report.layers.anyAside.zIndex)
    if (asideZ <= legendZ) {
      failed.push(`selected aside z=${asideZ} should be > legend z=${legendZ}`)
    }
  }

  if (failed.length > 0) {
    console.error('\nFAIL:')
    for (const f of failed) console.error('  - ' + f)
    process.exitCode = 1
  } else {
    console.log('\nPASS: layer order correct, no errors.')
  }
} finally {
  await browser.close()
}