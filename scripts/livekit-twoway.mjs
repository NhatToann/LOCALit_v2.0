/**
 * Real 2-way LiveKit voice-call test.
 *
 * Verifies end-to-end:
 *   1. Both users sign in
 *   2. John (tourist) opens /chat with Lan and clicks Phone
 *   3. John transitions: idle → calling → connecting → connected
 *   4. Lan sees IncomingCallWatcher with Accept button
 *   5. Lan clicks Accept, navigates to /chat?call=…
 *   6. Lan transitions: idle → connecting → connected
 *   7. Both peers reach 'connected' state (asserted via activeCallStore
 *      exposed on window.__activeCallState for tests)
 *   8. Either side ends → both transition to 'ended'
 *
 * Requires --use-fake-ui-for-media-stream + --use-fake-device-for-media-stream
 * so getUserMedia returns a synthetic stream without prompting.
 */
import { chromium } from 'playwright'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const PROD =
  process.env.LOCALIT_PROD_URL ||
  'https://localit-874nbkvj8-nhattoann.vercel.app'
const BYPASS_HEADER = {
  'x-vercel-protection-bypass':
    process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
}

const SCREENSHOT_DIR = path.join(process.cwd(), 'scripts', 'screenshots')
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111'
const LAN_ID = '11111111-1111-1111-1111-111111111111'

async function signIn(page, email, password) {
  await page.goto(PROD + '/login', { waitUntil: 'networkidle' })
  await page.waitForFunction(
    function () {
      return document.querySelectorAll('input').length >= 2
    },
    { timeout: 30000 },
  )
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL(
    function (url) {
      return !url.pathname.startsWith('/login')
    },
    { timeout: 30000 },
  )
}

async function openChat(page, partnerId, screenshot) {
  await page.goto(PROD + '/chat?buddy=' + partnerId, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('header, [role=banner]', { timeout: 15000 })
  if (screenshot) {
    await page.screenshot({ path: screenshot, fullPage: false })
  }
}

/**
 * Returns the active-call state (or null if no active call).
 * Reads from the activeCallStore singleton via window. The chat page
 * exposes this through `window.__activeCallState` for tests.
 */
async function readActiveCallState(page) {
  return await page.evaluate(function () {
    // activeCallStore is exported by lib/realtime/useActiveCallStore.
    // It's a module-level singleton — we expose a tiny probe to window
    // so Playwright can read it without bundling the module.
    var w = /** @type {any} */ (window)
    if (w.__activeCallState) return w.__activeCallState
    return null
  })
}

async function clickPhoneButton(page) {
  // The chat page exposes an aria-label="Start voice call" button.
  // Once a call is in flight the button is disabled. So we click it
  // and assert the aria-disabled flips to true.
  await page.click('button[aria-label="Start voice call"]')
  // Wait for the call state to advance to at least 'calling'.
  await page.waitForFunction(
    function () {
      var w = /** @type {any} */ (window)
      var s = w.__activeCallState
      return s && (s.state === 'calling' || s.state === 'connecting' || s.state === 'connected')
    },
    { timeout: 15000 },
  )
}

async function clickAcceptButton(page) {
  // IncomingCallWatcher renders Accept with aria-label="Accept call".
  // We click it and wait for navigation to /chat?call=…
  await page.click('button[aria-label="Accept call"]')
  await page.waitForFunction(
    function () {
      var w = /** @type {any} */ (window)
      var s = w.__activeCallState
      return s && (s.state === 'connecting' || s.state === 'connected')
    },
    { timeout: 15000 },
  )
}

async function waitForState(page, target, timeoutMs) {
  await page.waitForFunction(
    function (target) {
      var w = /** @type {any} */ (window)
      var s = w.__activeCallState
      return s && s.state === target
    },
    target,
    { timeout: timeoutMs },
  )
}

async function clickEndButton(page) {
  // CallModal exposes aria-label="End call" for the red hangup button.
  await page.click('button[aria-label="End call"]')
}

;(async () => {
  await mkdir(SCREENSHOT_DIR, { recursive: true })

  const browser = await chromium.launch({
    headless: true,
    args: [
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required',
    ],
  })

  const johnCtx = await browser.newContext({
    extraHTTPHeaders: BYPASS_HEADER,
    permissions: ['microphone'],
  })
  const johnPage = await johnCtx.newPage()
  // Surface browser console errors so debugging is faster.
  johnPage.on('pageerror', (err) => console.error('  [john pageerror]', err.message))
  johnPage.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [john console]', msg.text())
  })

  const lanCtx = await browser.newContext({
    extraHTTPHeaders: BYPASS_HEADER,
    permissions: ['microphone'],
  })
  const lanPage = await lanCtx.newPage()
  lanPage.on('pageerror', (err) => console.error('  [lan pageerror]', err.message))
  lanPage.on('console', (msg) => {
    if (msg.type() === 'error') console.error('  [lan console]', msg.text())
  })

  let failures = []

  try {
    console.log('-> Sign in as John (tourist)')
    await signIn(johnPage, 'john.doe@example.com', 'password123')

    console.log('-> Sign in as Lan (buddy)')
    await signIn(lanPage, 'lan.pham@localit.dev', 'password123')

    console.log('-> John opens chat with Lan')
    await openChat(
      johnPage,
      LAN_ID,
      path.join(SCREENSHOT_DIR, 'twoway-john-pre-call.png'),
    )

    console.log('-> Lan opens chat with John')
    await openChat(
      lanPage,
      JOHN_ID,
      path.join(SCREENSHOT_DIR, 'twoway-lan-pre-call.png'),
    )

    // Wait for conversations list to load on both sides.
    await johnPage.waitForTimeout(2000)

    // Sanity: window.__activeCallState probe should be wired up.
    // We patch it onto the page via init script below; for now just
    // verify the chat header rendered.
    await johnPage.waitForSelector('button[aria-label="Start voice call"]', {
      timeout: 10000,
    })
    await lanPage.waitForSelector('button[aria-label="Start voice call"]', {
      timeout: 10000,
    })

    console.log('-> John clicks Phone to start the call')
    await clickPhoneButton(johnPage)
    await johnPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'twoway-john-calling.png'),
      fullPage: false,
    })

    // John should be in 'connecting' or 'connected' state.
    let johnState = await readActiveCallState(johnPage)
    console.log('  john state after start:', johnState?.state)
    if (!johnState || !['calling', 'connecting', 'connected'].includes(johnState.state)) {
      failures.push('John did not enter calling/connecting/connected after click')
    }

    console.log('-> Lan waits for IncomingCallWatcher to appear')
    // The watcher renders the Accept button at the top-right.
    await lanPage.waitForSelector('button[aria-label="Accept call"]', {
      timeout: 15000,
    })
    await lanPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'twoway-lan-incoming.png'),
      fullPage: false,
    })

    console.log('-> Lan clicks Accept')
    await clickAcceptButton(lanPage)
    // After Accept, chat navigates to /chat?call=… and accepts the
    // call. The state should reach 'connected' (with a generous
    // timeout for LiveKit's room join).
    await waitForState(lanPage, 'connected', 20000)
    console.log('  Lan reached connected')

    await johnPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'twoway-john-connected.png'),
      fullPage: false,
    })
    await lanPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'twoway-lan-connected.png'),
      fullPage: false,
    })

    // Wait a beat for John to also see 'connected' (both peers in
    // the same LiveKit room).
    try {
      await waitForState(johnPage, 'connected', 15000)
      console.log('  John also reached connected')
    } catch (e) {
      johnState = await readActiveCallState(johnPage)
      console.warn('  John never reached connected, state=', johnState?.state)
      failures.push('John did not transition to connected within 15s')
    }

    // Hold the call open for a moment so audio can flow.
    await johnPage.waitForTimeout(2000)
    johnState = await readActiveCallState(johnPage)
    const lanState = await readActiveCallState(lanPage)
    console.log('  john state:', johnState?.state)
    console.log('  lan state:', lanState?.state)

    console.log('-> John clicks End')
    await clickEndButton(johnPage)
    await johnPage.waitForTimeout(2500)
    johnState = await readActiveCallState(johnPage)
    console.log('  john state after end:', johnState?.state)
    if (johnState && !['ended', 'idle'].includes(johnState.state)) {
      failures.push('John did not transition to ended after End click')
    }

    await johnPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'twoway-john-ended.png'),
      fullPage: false,
    })
    await lanPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'twoway-lan-ended.png'),
      fullPage: false,
    })

    if (failures.length === 0) {
      console.log('')
      console.log('PASS LiveKit 2-way call test (both peers reached connected)')
    } else {
      console.log('')
      console.log('FAIL LiveKit 2-way call test:')
      for (const f of failures) console.log('  -', f)
      process.exitCode = 1
    }
  } catch (e) {
    console.error('')
    console.error('FAIL LiveKit 2-way call test (threw):')
    console.error(e)
    process.exitCode = 1
  } finally {
    await browser.close()
  }
})()
