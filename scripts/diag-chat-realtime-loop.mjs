// scripts/diag-chat-realtime-loop.mjs
// Reproduce: open /chat, count Supabase realtime WebSocket CONNECTIONS
// (not frames) created over 20s. Each `supabase.channel(...).subscribe()`
// opens a new WS via Network.webSocketCreated. A healthy /chat shows
// exactly 1 typing-*, 1 presence-*, 1 conv-list-* — anything more is a
// reconnect loop caused by effect deps that churn on every render.
//
// Also tallies React render-loop / "Maximum update depth" errors and
// realtime fallback warnings.
import { chromium } from 'playwright'

const BASE = process.env.LOCALIT_URL || 'https://localit-nhattoann.vercel.app'
const EMAIL = 'lan.pham@localit.dev'
const PASSWORD = 'password123'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  })
  const page = await ctx.newPage()

  // CDP: capture every WebSocket creation
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Network.enable')
  const wsList = []
  cdp.on('Network.webSocketCreated', (e) => {
    wsList.push({ at: Date.now(), url: e.url })
  })
  cdp.on('Network.webSocketClosed', (e) => {
    wsList.push({ at: Date.now(), url: '<closed>', id: e.requestId })
  })

  const consoleLines = []
  const pageErrors = []
  page.on('console', (m) => consoleLines.push({ type: m.type(), text: m.text() }))
  page.on('pageerror', (err) => pageErrors.push(err.message))

  // Login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input[type=email]', { timeout: 15_000 })
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PASSWORD)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20_000 }),
    page.click('button[type=submit]'),
  ])

  // Watch window on /chat
  const t0 = Date.now()
  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3_000) // let initial channels mount

  // Click the first conversation in the sidebar to activate activeId,
  // which mounts useMessageStream + useTyping + usePresence.
  // The chat sidebar is an <aside> with <button> per conversation
  // (no data attr; we target by aria-current + parent <li>).
  const convSelector = 'aside li button, aside button[type="button"]'
  try {
    const conv = await page.waitForSelector(convSelector, { timeout: 8_000 })
    const label = (await conv.textContent())?.slice(0, 60) ?? ''
    console.log(`[smoke] clicking conversation: ${JSON.stringify(label)}`)
    await conv.click()
    await page.waitForTimeout(1_500)
  } catch (e) {
    console.log('WARN: could not find a conversation to click — testing idle state only:', e.message)
  }

  // Reset baseline AFTER the initial mount so we only count re-mounts
  const baseline = wsList.length
  const initial = wsList.slice()

  // Watch for 30s — covers the heartbeat poll (30s) AND any typing/
  // presence reconnect storm. Then type a message in the composer to
  // force notifyTyping() to fire and any channel churn to manifest.
  const t1 = Date.now()
  await page.waitForTimeout(15_000)
  // Try to type a message in the composer to trigger notifyTyping broadcasts
  const composer = await page.$('textarea, input[type="text"][placeholder*="message" i]')
  if (composer) {
    try {
      await composer.click()
      await page.keyboard.type('test typing', { delay: 50 })
      console.log('[smoke] typed into composer')
    } catch (e) {
      console.log('WARN: composer type failed:', e.message)
    }
  } else {
    console.log('WARN: composer textarea not found')
  }
  await page.waitForTimeout(15_000)
  const elapsed = Date.now() - t1

  const newWs = wsList.slice(baseline)
  // Realtime channels sit on /realtime/v1/websocket
  const newRealtime = newWs.filter((w) => /\/realtime\/v1\/websocket/.test(w.url || ''))
  // Initial (pre-baseline) — healthy should be 1 (the single shared
  // Supabase WS that multiplexes all channels).
  const initialRealtime = initial.filter((w) => /\/realtime\/v1\/websocket/.test(w.url || ''))

  const renderWarnings = consoleLines.filter((l) =>
    /Maximum update depth|too many re-renders|Cannot update a component while rendering/i.test(l.text),
  ).length
  const sendFallback = consoleLines.filter((l) => /Realtime send\(\) is automatically falling back/i.test(l.text)).length
  const channelErrors = consoleLines.filter((l) => /CHANNEL_ERROR|TIMED_OUT|\[useTyping\]|\[usePresence\]|\[useMessageStream\]/i.test(l.text)).length
  const useTypingMount = consoleLines.filter((l) => /\[useTyping\] mount/.test(l.text)).length
  const useTypingUnmount = consoleLines.filter((l) => /\[useTyping\] unmount/.test(l.text)).length

  const report = {
    elapsed_ms: elapsed,
    initial_realtime_ws: initialRealtime.length,
    post_baseline_realtime_ws: newRealtime.length,
    render_warnings: renderWarnings,
    realtime_send_fallback: sendFallback,
    channel_errors: channelErrors,
    useTyping_mount_count: useTypingMount,
    useTyping_unmount_count: useTypingUnmount,
    page_errors: pageErrors.slice(0, 3),
  }
  console.log(JSON.stringify(report, null, 2))

  const failed = []
  if (newRealtime.length > 0) failed.push(`${newRealtime.length} new realtime WS created AFTER initial mount — reconnect loop`)
  if (useTypingMount > 1) failed.push(`[useTyping] mounted ${useTypingMount}x in 20s — channel churn`)
  if (useTypingUnmount > 1) failed.push(`[useTyping] unmounted ${useTypingUnmount}x in 20s — channel churn`)
  if (renderWarnings > 0) failed.push(`${renderWarnings} React render-loop warning(s)`)
  if (pageErrors.length > 0) failed.push(`${pageErrors.length} page error(s): ${pageErrors[0]}`)

  if (failed.length) {
    console.log('FAIL:')
    for (const f of failed) console.log('  -', f)
    process.exitCode = 1
  } else {
    console.log('PASS: /chat has stable realtime channels over 20s.')
  }
} finally {
  await browser.close()
}
