// scripts/diag-realtime-loop-all.mjs
// For each key authenticated page, count:
//  - new WebSocket connections after initial mount
//  - React render-loop warnings
//  - realtime fallback warnings
//  - console error/warn lines from useTyping/usePresence/useMessageStream
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

async function runPage(page, name, path) {
  const wsAll = []
  const consoleLines = []
  const pageErrors = []

  page.on('console', (m) => consoleLines.push({ type: m.type(), text: m.text() }))
  page.on('pageerror', (err) => pageErrors.push(err.message))

  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2_000) // settle

  // baseline after initial mount
  const baseline = wsAll.length

  await page.waitForTimeout(20_000)

  const newWs = wsAll.slice(baseline)
  const newRealtime = newWs.filter((w) => /\/realtime\/v1\/websocket/.test(w.url))

  const renderWarnings = consoleLines.filter((l) =>
    /Maximum update depth|too many re-renders|Cannot update.*while.*rendering/i.test(l.text),
  ).length
  const sendFallback = consoleLines.filter((l) => /falling back/i.test(l.text)).length
  const channelErrors = consoleLines.filter((l) =>
    /CHANNEL_ERROR|TIMED_OUT|\[useTyping\]|\[usePresence\]|\[useMessageStream\]|\[useMessageStream\] channel error/i.test(l.text),
  ).length
  const useTypingMount = consoleLines.filter((l) => /\[useTyping\] mount/.test(l.text)).length
  const useTypingUnmount = consoleLines.filter((l) => /\[useTyping\] unmount/.test(l.text)).length
  const useMsgMount = consoleLines.filter((l) => /\[useMessageStream\] mount/.test(l.text)).length
  const useMsgUnmount = consoleLines.filter((l) => /\[useMessageStream\] unmount/.test(l.text)).length

  return {
    name,
    path,
    new_realtime_ws: newRealtime.length,
    render_warnings: renderWarnings,
    send_fallback: sendFallback,
    channel_errors: channelErrors,
    useTyping_mount: useTypingMount,
    useTyping_unmount: useTypingUnmount,
    useMsgStream_mount: useMsgMount,
    useMsgStream_unmount: useMsgUnmount,
    page_errors: pageErrors.slice(0, 2),
  }
}

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()

  // CDP: capture WebSocket lifecycle
  const cdp = await ctx.newCDPSession(page)
  await cdp.send('Network.enable')
  const wsAll = []
  cdp.on('Network.webSocketCreated', (e) => wsAll.push({ at: Date.now(), url: e.url }))
  cdp.on('Network.webSocketClosed', (e) => wsAll.push({ at: Date.now(), url: '<closed>', id: e.requestId }))

  // Login once
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 10_000 })
  await page.fill('input[type=email]', 'john.doe@example.com')
  await page.fill('input[type=password]', 'password123')
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20_000 }),
    page.click('button[type=submit]'),
  ])

  const PAGES = ['/dashboard', '/browse', '/map', '/chat']
  for (const p of PAGES) {
    const r = await runPage(page, p, p)
    console.log(JSON.stringify(r))
    if (r.new_realtime_ws > 0 || r.render_warnings > 0 || r.useTyping_mount > 1 || r.useMsgStream_mount > 1) {
      console.error(`FAIL: ${p} has realtime churn or render loop`)
    } else {
      console.log(`PASS: ${p}`)
    }
  }
} finally {
  await browser.close()
}
