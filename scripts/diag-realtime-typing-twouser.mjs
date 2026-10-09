// scripts/diag-realtime-typing-twouser.mjs
// Open /chat in TWO Playwright contexts (lan + john), have both type,
// and verify the realtime channel stays open (no reconnect storm).
//
// Reproduces the user's report: 2 users in same conversation, one
// types, the other sees the typing indicator, the channel must NOT
// thrash.

import { chromium } from 'playwright'

const BASE = process.env.LOCALIT_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const USERS = [
  { email: 'lan.pham@localit.dev', password: 'password123', label: 'A' },
  { email: 'john.doe@example.com', password: 'password123', label: 'B' },
]

const browser = await chromium.launch({ headless: true })
const contexts = []
try {
  const wsLog = {}
  const errLog = {}
  const consoleLog = {}
  for (const u of USERS) {
    const ctx = await browser.newContext({
      viewport: { width: 1024, height: 768 },
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    })
    const page = await ctx.newPage()
    wsLog[u.label] = []
    errLog[u.label] = []
    consoleLog[u.label] = []

    const cdp = await page.context().newCDPSession(page)
    await cdp.send('Network.enable')
    cdp.on('Network.webSocketCreated', (e) => {
      wsLog[u.label].push({ at: Date.now(), url: e.url })
    })
    page.on('pageerror', (e) => errLog[u.label].push(e.message))
    page.on('console', (m) => consoleLog[u.label].push(m.text()))

    await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('input[type=email]', { timeout: 15_000 })
    await page.fill('input[type=email]', u.email)
    await page.fill('input[type=password]', u.password)
    await Promise.all([
      page.waitForURL((url) => !url.toString().includes('/login'), { timeout: 20_000 }),
      page.click('button[type=submit]'),
    ])
    await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(2_000)
    // Click the first conversation
    const conv = await page
      .waitForSelector('aside li button', { timeout: 8_000 })
      .catch(() => null)
    if (conv) {
      await conv.click()
      await page.waitForTimeout(1_500)
    }
    contexts.push({ ctx, page, user: u })
  }

  // Baseline WS counts after the initial mount of both clients
  const baseline = {}
  for (const u of USERS) {
    baseline[u.label] = wsLog[u.label].length
  }

  // Run for 25s. Have BOTH users type to force the typing broadcast.
  for (let i = 0; i < 5; i++) {
    for (const { page, user } of contexts) {
      const ta = await page.$('textarea')
      if (ta) {
        await ta.click()
        await page.keyboard.type(`hello ${user.label}-${i}`, { delay: 80 })
      }
    }
    await new Promise((r) => setTimeout(r, 5_000))
  }

  // Wait 5s to flush
  await new Promise((r) => setTimeout(r, 5_000))

  // Report
  const out = {}
  for (const u of USERS) {
    const allWs = wsLog[u.label]
    const newWs = allWs.slice(baseline[u.label])
    const newRealtime = newWs.filter((w) => /\/realtime\/v1\/websocket/.test(w.url || ''))
    const fallbacks = consoleLog[u.label].filter((l) =>
      /Realtime send\(\) is automatically falling back/i.test(l),
    ).length
    const errors = errLog[u.label].length
    out[u.label] = {
      user: u.email,
      total_ws: allWs.length,
      post_baseline_ws: newWs.length,
      post_baseline_realtime: newRealtime.length,
      send_fallback_warnings: fallbacks,
      page_errors: errors,
      page_errors_first: errLog[u.label].slice(0, 2),
    }
  }
  console.log(JSON.stringify(out, null, 2))

  // Pass/fail
  let failed = false
  for (const u of USERS) {
    if (out[u.label].post_baseline_realtime > 2) {
      console.log(`FAIL: ${u.label} opened ${out[u.label].post_baseline_realtime} new realtime WS in 30s`)
      failed = true
    }
    if (out[u.label].page_errors > 0) {
      console.log(`FAIL: ${u.label} had ${out[u.label].page_errors} page errors`)
      failed = true
    }
  }
  if (!failed) console.log('PASS: 2-user /chat with typing stays stable.')
} finally {
  for (const { ctx } of contexts) await ctx.close()
  await browser.close()
}
