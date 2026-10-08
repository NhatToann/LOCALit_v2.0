#!/usr/bin/env node
// Diagnose /dashboard map: count Leaflet instances, tile pane state,
// invalidateSize call, scroll/zoom handler attachment.

import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    geolocation: { latitude: 16.0544, longitude: 108.2023 },
    permissions: ['geolocation'],
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  // Land on /dashboard
  await page.waitForURL('**/dashboard', { timeout: 10000 })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })
  await page.waitForTimeout(3000)

  // Click "Sharing live" or Share my location to trigger a GPS-based map state
  const shareBtn = await page.locator('button:has-text("Share my location")').first()
  if (await shareBtn.count() > 0) {
    await shareBtn.click()
  }
  await page.waitForTimeout(2000)

  // Snapshot: count Leaflet instances, panes, tile counts
  const state = await page.evaluate(() => {
    const containers = document.querySelectorAll('.leaflet-container')
    const tileImgs = document.querySelectorAll('.leaflet-tile')
    const tileLoaded = document.querySelectorAll('.leaflet-tile-loaded')
    const allPanes = []
    containers.forEach((c, i) => {
      const panes = c.querySelectorAll('.leaflet-pane')
      const mapPane = c.querySelector('.leaflet-map-pane')
      const tilePane = c.querySelector('.leaflet-tile-pane')
      const overlayPane = c.querySelector('.leaflet-overlay-pane')
      const markerPane = c.querySelector('.leaflet-marker-pane')
      const popupPane = c.querySelector('.leaflet-popup-pane')
      const tileLayer = c.querySelector('.leaflet-tile-layer')
      const cr = c.getBoundingClientRect()
      allPanes.push({
        idx: i,
        containerRect: { w: Math.round(cr.width), h: Math.round(cr.height), t: Math.round(cr.top) },
        mapPaneTransform: mapPane ? mapPane.style.transform : null,
        mapPaneRect: mapPane ? {
          w: Math.round(mapPane.getBoundingClientRect().width),
          h: Math.round(mapPane.getBoundingClientRect().height),
        } : null,
        tilePaneZ: tilePane ? window.getComputedStyle(tilePane).zIndex : null,
        tilePaneSize: tilePane ? {
          w: Math.round(tilePane.getBoundingClientRect().width),
          h: Math.round(tilePane.getBoundingClientRect().height),
        } : null,
        tileCount: tilePane ? tilePane.querySelectorAll('img').length : 0,
        tileLoadedCount: tilePane ? tilePane.querySelectorAll('.leaflet-tile-loaded').length : 0,
        tileTransforms: tilePane ? Array.from(tilePane.querySelectorAll('img')).slice(0, 4).map((t) => t.style.transform) : [],
        markerCount: markerPane ? markerPane.querySelectorAll('.leaflet-marker-icon').length : 0,
        overlayCount: overlayPane ? overlayPane.children.length : 0,
        popupCount: popupPane ? popupPane.querySelectorAll('.leaflet-popup').length : 0,
        tileLayerPresent: !!tileLayer,
        ariaLabel: c.getAttribute('aria-label'),
        // Check for duplicate _leaflet_id which signals 2 instances sharing a DOM node
        leafletId: c._leaflet_id,
      })
    })
    return {
      containerCount: containers.length,
      containers: allPanes,
      // Detect global window leak
      globalLeafletKeys: Object.keys(window).filter((k) => k.startsWith('L') || k.includes('leaflet')).slice(0, 10),
    }
  })

  // Try a zoom-in click and watch tile re-render
  const beforeZoom = await page.evaluate(() => {
    const tp = document.querySelector('.leaflet-tile-pane')
    return { transform: tp?.style.transform, imgCount: tp ? tp.querySelectorAll('img').length : 0 }
  })

  await page.locator('.leaflet-control-zoom-in').first().click()
  await page.waitForTimeout(2000)
  const afterZoom = await page.evaluate(() => {
    const tp = document.querySelector('.leaflet-tile-pane')
    return { transform: tp?.style.transform, imgCount: tp ? tp.querySelectorAll('img').length : 0 }
  })

  // Try a scroll-wheel zoom
  const mapBox = await page.locator('.leaflet-container').first().boundingBox()
  if (mapBox) {
    await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2)
    await page.mouse.wheel(0, -200)
    await page.waitForTimeout(2000)
  }
  const afterScroll = await page.evaluate(() => {
    const tp = document.querySelector('.leaflet-tile-pane')
    return { transform: tp?.style.transform, imgCount: tp ? tp.querySelectorAll('img').length : 0 }
  })

  console.log('=== Map state ===')
  console.log(JSON.stringify(state, null, 2))
  console.log('\n=== Before zoom ===')
  console.log(JSON.stringify(beforeZoom))
  console.log('=== After click + ===')
  console.log(JSON.stringify(afterZoom))
  console.log('=== After wheel ===')
  console.log(JSON.stringify(afterScroll))

  // Verdicts
  const failures = []
  if (state.containerCount > 1) failures.push(`${state.containerCount} Leaflet containers stacked (expected 1)`)
  for (const c of state.containers) {
    if (c.tileCount > 0 && c.tileLoadedCount === 0) {
      failures.push(`Container #${c.idx}: ${c.tileCount} tile <img> elements loaded but 0 are .leaflet-tile-loaded (network blocked?)`)
    }
    if (c.tilePaneSize && c.containerRect && c.tilePaneSize.h < c.containerRect.h / 2) {
      failures.push(`Container #${c.idx}: tilePane height ${c.tilePaneSize.h} is much smaller than container height ${c.containerRect.h} (clipping)`)
    }
  }
  if (beforeZoom.imgCount > 0 && afterZoom.imgCount === beforeZoom.imgCount) {
    failures.push(`Zoom-in click did not change tile count (${beforeZoom.imgCount} → ${afterZoom.imgCount}) — TileLayer not responding`)
  }
  console.log('\n=== Verdicts ===')
  if (failures.length === 0) {
    console.log('PASS')
  } else {
    console.log('FAIL:')
    for (const f of failures) console.log('  - ' + f)
  }
} finally {
  await browser.close()
}