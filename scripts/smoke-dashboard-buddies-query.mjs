// scripts/smoke-dashboard-buddies-query.mjs
// Verify the /dashboard buddies query is healthy on production. Catches
// the "column buddies.is_online does not exist" class of regression
// that the 2026-10-09 fix closed.

import { chromium } from 'playwright'

const BASE = process.env.LOCALIT_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()

  const restFours = []
  page.on('response', (r) => {
    const url = r.url()
    if (url.includes('/rest/v1/') && r.status() >= 400) {
      restFours.push({ status: r.status(), url: url.split('?')[0] + '?...' })
    }
  })
  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message))

  // Login as Lan (has 0 connections, but the buddies query still must NOT 400)
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 15_000 })
  await page.fill('input[type=email]', 'lan.pham@localit.dev')
  await page.fill('input[type=password]', 'password123')
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20_000 }),
    page.click('button[type=submit]'),
  ])

  // Navigate to /dashboard
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
  await page.waitForTimeout(8_000)

  const report = {
    rest_4xx_total: restFours.length,
    rest_4xx_first: restFours[0] ?? null,
    page_errors: pageErrors.slice(0, 3),
  }
  console.log(JSON.stringify(report, null, 2))

  if (restFours.length > 0) {
    console.log(`FAIL: ${restFours.length} /rest/v1 request(s) returned 4xx`)
    process.exitCode = 1
  } else {
    console.log('PASS: dashboard /rest/v1 queries are all healthy.')
  }
} finally {
  await browser.close()
}
