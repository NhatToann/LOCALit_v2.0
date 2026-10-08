#!/usr/bin/env node
// Verify /browse: map tiles must NOT visually cover the page-level
// header (find buddies) or the "Buddy map / Find buddies around Da Nang"
// section header that lives ABOVE the MapView.

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
    viewport: { width: 1280, height: 1400 },
  })
  const page = await ctx.newPage()

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.leaflet-container', { timeout: 10000 })
  await page.waitForTimeout(2500) // let tiles + buddies hydrate

  // Measure layout of every element above the Leaflet container
  const layout = await page.evaluate(() => {
    const container = document.querySelector('.leaflet-container')
    const section = container?.closest('section[aria-label="Buddy map"]')
    const sectionHeader = section?.querySelector('h2')
    const findBuddiesH1 = document.querySelector('h1')
    // Walk through ALL of the section's DOM children and report geometry
    const allAbove = section ? section.querySelectorAll('*') : []
    const siblingsAbove = []
    let prev = section?.previousElementSibling
    while (prev) {
      siblingsAbove.push(prev.outerHTML.slice(0, 60))
      prev = prev.previousElementSibling
    }
    // Find every Leaflet pane + measure its bounding rect
    const panes = ['tile', 'overlay', 'shadow', 'marker', 'popup'].map((n) => {
      const el = document.querySelector(`.leaflet-${n}-pane`)
      if (!el) return { name: n, present: false }
      const r = el.getBoundingClientRect()
      return {
        name: n,
        present: true,
        z: window.getComputedStyle(el).zIndex,
        top: Math.round(r.top),
        left: Math.round(r.left),
        width: Math.round(r.width),
        height: Math.round(r.height),
      }
    })
    const containerR = container?.getBoundingClientRect()
    const sectionHeaderR = sectionHeader?.getBoundingClientRect()
    const findH1R = findBuddiesH1?.getBoundingClientRect()
    return {
      panes,
      container: containerR && {
        top: Math.round(containerR.top),
        left: Math.round(containerR.left),
        width: Math.round(containerR.width),
        height: Math.round(containerR.height),
      },
      sectionHeader: sectionHeaderR && {
        text: sectionHeader?.textContent,
        top: Math.round(sectionHeaderR.top),
        left: Math.round(sectionHeaderR.left),
        width: Math.round(sectionHeaderR.width),
        height: Math.round(sectionHeaderR.height),
      },
      findH1: findH1R && {
        text: findBuddiesH1?.textContent,
        top: Math.round(findH1R.top),
      },
      siblingsAbove: siblingsAbove.slice(0, 6),
    }
  })

  // Scroll the "Find buddies around Da Nang" section header into view
  // so we can screenshot the exact zone the user is complaining about.
  await page.evaluate(() => {
    const h2 = document.querySelector('section[aria-label="Buddy map"] h2')
    h2?.scrollIntoView({ block: 'start' })
  })
  await page.waitForTimeout(800)
  await page.screenshot({
    path: path.join(SS_DIR, 'diag-browse-section-header.png'),
    fullPage: false,
  })

  // Also screenshot the top of the page (where the user sees the problem)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(SS_DIR, 'diag-browse-top.png'),
    fullPage: false,
  })

  console.log(JSON.stringify(layout, null, 2))

  // Verdicts:
  //   1. tilePane top must be >= sectionHeader bottom (no overlap)
  //   2. container.top must be >= sectionHeader.bottom
  const tilePane = layout.panes.find((p) => p.name === 'tile')
  const sh = layout.sectionHeader
  const fail = []
  if (sh && tilePane?.present && tilePane.top < sh.top + sh.height) {
    fail.push(
      `tilePane.top=${tilePane.top} starts INSIDE section header (bottom=${sh.top + sh.height})`,
    )
  }
  if (sh && layout.container && layout.container.top < sh.top + sh.height - 2) {
    fail.push(
      `MapView container.top=${layout.container.top} starts INSIDE section header (bottom=${sh.top + sh.height})`,
    )
  }
  if (fail.length > 0) {
    console.error('\nFAIL:')
    for (const f of fail) console.error('  - ' + f)
    process.exitCode = 1
  } else {
    console.log('\nPASS: map does not overlap section header in document flow.')
  }
} finally {
  await browser.close()
}