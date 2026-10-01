/**
 * LiveKit 2-way voice-call Playwright test.
 *
 * Constraints (per user 2026-10-01):
 *   - 1 Chromium headless, max 2 contexts (A=tourist John, B=buddy Lan)
 *   - 1 page per context, no extra tabs
 *   - Independent cookies per context
 *   - Fake media: --use-fake-ui-for-media-stream + --use-fake-device-for-media-stream
 *   - Sequential: A calls → B receives → assert connected → end → close
 *   - Screenshots only on failure
 *   - Always close contexts + browser
 *
 * Reads call state from window.__activeCallState (exposed by
 * app/chat/page.tsx for tests). Asserts both peers reach 'connected'
 * via the LiveKit room before ending.
 */
import { chromium } from 'playwright'
import path from 'node:path'
import { mkdir } from 'node:fs/promises'

const PROD =
  process.env.LOCALIT_PROD_URL ||
  'https://localit-dz751x5du-nhattoann.vercel.app'
const BYPASS = {
  'x-vercel-protection-bypass':
    process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
}

const SCREENSHOT_DIR = path.join(process.cwd(), 'scripts', 'screenshots')
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111'
const LAN_ID = '11111111-1111-1111-1111-111111111111'

async function signIn(page, email, password) {
  await page.goto(PROD + '/login', { waitUntil: 'networkidle' })
  await page.waitForFunction(
    () => document.querySelectorAll('input').length >= 2,
    { timeout: 30000 },
  )
  await page.fill('#email', email)
  await page.fill('#password', password)
  await page.click('button[type=submit]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 })
}

async function openChatWith(page, partnerId) {
  await page.goto(PROD + '/chat?buddy=' + partnerId, {
    waitUntil: 'domcontentloaded',
  })
  await page.waitForSelector('button[aria-label="Start voice call"]', {
    timeout: 15000,
  })
}

async function readState(page) {
  return await page.evaluate(() => window.__activeCallState || null)
}

async function waitForState(page, target, timeoutMs) {
  await page.waitForFunction(
    (t) => window.__activeCallState && window.__activeCallState.state === t,
    target,
    { timeout: timeoutMs },
  )
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SCREENSHOT_DIR, name) })
}

async function safeClose(...handles) {
  for (const h of handles) {
    try {
      await h?.close?.()
    } catch {}
  }
}

let failures = []
async function shotFail(page, name) {
  try {
    await shot(page, `twoway-FAIL-${name}.png`)
  } catch {}
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

  let johnCtx, lanCtx, johnPage, lanPage
  try {
    johnCtx = await browser.newContext({
      extraHTTPHeaders: BYPASS,
      permissions: ['microphone'],
    })
    johnPage = await johnCtx.newPage()
    johnPage.on('pageerror', (e) => console.error('[john pageerror]', e.message))

    lanCtx = await browser.newContext({
      extraHTTPHeaders: BYPASS,
      permissions: ['microphone'],
    })
    lanPage = await lanCtx.newPage()
    lanPage.on('pageerror', (e) => console.error('[lan pageerror]', e.message))

    console.log('-> Sign in John (tourist)')
    await signIn(johnPage, 'john.doe@example.com', 'password123')

    console.log('-> Sign in Lan (buddy)')
    await signIn(lanPage, 'lan.pham@localit.dev', 'password123')

    console.log('-> Open chat pages')
    await openChatWith(johnPage, LAN_ID)
    await openChatWith(lanPage, JOHN_ID)
    // Let conversations hydrate.
    await johnPage.waitForTimeout(1500)

    console.log('-> John starts the call')
    await johnPage.click('button[aria-label="Start voice call"]')
    try {
      await waitForState(johnPage, 'connected', 20000)
    } catch (e) {
      const s = await readState(johnPage)
      failures.push('John never reached connected (state=' + s?.state + ')')
      await shotFail(johnPage, 'john-no-connect')
    }

    console.log('-> Lan receives incoming call')
    try {
      await lanPage.waitForSelector('button[aria-label="Accept call"]', {
        timeout: 10000,
      })
      await lanPage.click('button[aria-label="Accept call"]')
      await waitForState(lanPage, 'connected', 20000)
    } catch (e) {
      const s = await readState(lanPage)
      failures.push('Lan never reached connected (state=' + s?.state + ')')
      await shotFail(lanPage, 'lan-no-connect')
    }

    // Hold the call open briefly so audio has time to flow.
    await johnPage.waitForTimeout(2000)

    const j = await readState(johnPage)
    const l = await readState(lanPage)
    console.log('  john state:', j?.state)
    console.log('  lan state:', l?.state)

    if (j?.state !== 'connected') failures.push('John state not connected: ' + j?.state)
    if (l?.state !== 'connected') failures.push('Lan state not connected: ' + l?.state)

    console.log('-> John ends the call')
    await johnPage.click('button[aria-label="End call"]')
    await johnPage.waitForTimeout(2000)
    const after = await readState(johnPage)
    if (after && !['ended', 'idle'].includes(after.state)) {
      failures.push('John did not end cleanly (state=' + after.state + ')')
    }

    if (failures.length === 0) {
      console.log('\nPASS LiveKit 2-way voice call (both peers connected)')
    } else {
      console.log('\nFAIL LiveKit 2-way voice call:')
      for (const f of failures) console.log('  -', f)
      process.exitCode = 1
    }
  } catch (e) {
    console.error('\nFAIL LiveKit 2-way voice call (threw):')
    console.error(e)
    process.exitCode = 1
  } finally {
    await safeClose(johnPage, lanPage, johnCtx, lanCtx, browser)
  }
})()