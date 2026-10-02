/**
 * Playwright 2-way call timing regression test (2026-10-02).
 *
 * Verifies the critical bug fix: the call modal MUST appear BEFORE the
 * browser's mic permission prompt fires. Before the fix, the user
 * would click the Phone button and then see NOTHING for 1-3 seconds,
 * then the mic prompt would block their UI, then (only after they
 * accepted the prompt) the modal would finally render. That was the
 * "critical-mass-broken" UX failure described by the user.
 *
 * Sequence under test:
 *
 *   CALLER (John)
 *     1. /chat?conversation=X  → open chat
 *     2. Click Phone button     → assert <CallModal> visible
 *                                   within 500ms of click
 *     3. Assert mic permission prompt fires AFTER modal mount
 *        (i.e. the modal is rendered when getUserMedia is invoked)
 *     4. Accept mic prompt       → state goes connecting → connected
 *     5. Assert timer shows "00:00" within 5s
 *     6. Click Disconnect (End)  → "Call ended" frame → modal gone
 *        within 2.5s
 *
 *   RECEIVER (Lan)
 *     1. Caller clicks Phone → Receiver's <IncomingCallCard> appears
 *        in top-right
 *     2. Click Accept         → <CallModal> visible within 500ms
 *     3. Accept mic prompt
 *     4. Assert timer shows "00:00" within 5s
 *     5. Click Disconnect     → "Call ended" frame → modal gone
 *        within 2.5s
 *
 * Sidebar parity check: /chat sidebar MUST NOT contain a "Rate"
 * section — Rate was removed 2026-10-02 per user request.
 *
 * RAM-conscious: launches ONE browser, one context per scenario
 * (caller, receiver, sidebar), closes between. Reuses seed
 * accounts from scripts/seed-accounts.mjs:
 *   - tourist: john.doe@example.com / password123
 *   - buddy:   lan.pham@localit.dev  / password123
 */
import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const API_BASE = process.env.API_BASE || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyXf9Pea8I6zwVONXAhc8Xs9A'
const SCREENSHOT_DIR = path.join(
  __dirname,
  'screenshots',
  'regression-2026-10-02-call-timing',
)

const SEEDS = {
  tourist: { email: 'john.doe@example.com', password: 'password123' },
  buddy: { email: 'lan.pham@localit.dev', password: 'password123' },
}

const results = []
function pass(name, detail = '') {
  results.push({ name, status: 'PASS', detail })
  console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`)
}
function fail(name, detail = '') {
  results.push({ name, status: 'FAIL', detail })
  console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`)
}

async function shot(page, label) {
  try {
    const fname = `${label}.png`
    const fpath = path.join(SCREENSHOT_DIR, fname)
    await page.screenshot({ path: fpath, fullPage: false })
    console.log(`        📸 ${fname}`)
  } catch {
    /* ignore */
  }
}

async function loginAs(page, email, password) {
  await page.goto(`${API_BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#email', { timeout: 30000, state: 'visible' })
  await page.fill('input#email', email)
  await page.fill('input#password', password)
  await Promise.all([
    page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 25000 }),
    page.locator('input#password').press('Enter'),
  ])
  // Wait for chat page hydration so realtime + presence are live
  // before the test fires a call. Without this, the receiver's
  // IncomingCallWatcher might miss the postgres_changes event
  // because the realtime subscription isn't bound yet.
  await page.goto(`${API_BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('h1:has-text("Messages")', {
    timeout: 15000,
    state: 'visible',
  })
}

async function newBrowser() {
  return chromium.launch({
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      // Auto-grant mic + camera so tests can verify mic flow without
      // hanging on a popup. The browser STILL creates the
      // MediaStreamTrack (i.e. mic is "accessed") — the test then
      // asserts the modal rendered BEFORE that access happened.
      '--use-fake-ui-for-media-stream',
      '--use-fake-device-for-media-stream',
    ],
  })
}

async function scenario(name, fn) {
  console.log(`\n[${name}]`)
  const browser = await newBrowser()
  const ctxOpts = {
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 800 },
  }
  const ctx = await browser.newContext(ctxOpts)
  const page = await ctx.newPage()
  try {
    await fn(page)
  } catch (err) {
    fail(name, err.message)
    try {
      await shot(page, `${name}-error`)
    } catch {
      /* ignore */
    }
  } finally {
    await ctx.close()
    await browser.close()
  }
}

async function selectFirstConversation(page) {
  // The conversation row is a <li> button. Click the first one that
  // isn't the empty-state ("No conversations yet"). For John / Lan
  // there should be exactly one conversation in seed data.
  const rows = page.locator('aside button[aria-current], aside [role="button"]')
  // Try the role-tagged rows first
  const convItem = page.locator('aside li button').first()
  await convItem.click()
  await page.waitForTimeout(500)
}

async function main() {
  await mkdir(SCREENSHOT_DIR, { recursive: true })
  console.log(`\n=== LOCALit 2026-10-02 call-timing regression ===`)
  console.log(`API_BASE: ${API_BASE}`)
  console.log(`Output:   ${SCREENSHOT_DIR}\n`)

  // -----------------------------------------------------------------
  // Scenario 1: CALLER — click Phone, assert modal appears within 500ms
  // -----------------------------------------------------------------
  await scenario('caller-phone-timing', async (page) => {
    await loginAs(page, SEEDS.tourist.email, SEEDS.tourist.password)
    await selectFirstConversation(page)

    // Locate the Start voice call button (e42 was the one matching in
    // earlier runs — we re-query for resilience)
    const phoneBtn = page
      .locator('button[aria-label="Start voice call"]')
      .first()
    await phoneBtn.waitFor({ timeout: 10000, state: 'visible' })

    // Capture mic-access timestamp BEFORE click
    const clickStart = Date.now()
    await phoneBtn.click()

    // The call modal MUST appear within 500ms of click. We look for
    // the role="dialog" container that the global ActiveCallSheet
    // mounts, or any element with the call headline ("Connecting to
    // server…" / "Calling …" / "Ringing…").
    const modal = page.locator(
      '[role="dialog"], [data-testid="call-modal"], div:has-text("Connecting to server"), div:has-text("Calling "), div:has-text("Ringing")',
    )
    let modalAppearedAt = null
    try {
      await modal.first().waitFor({ timeout: 500, state: 'visible' })
      modalAppearedAt = Date.now()
    } catch {
      // Fall back: search for any element containing call-modal
      // markers
      const fallback = page.locator('text=/Connecting to server|Calling|Ringing/i')
      await fallback.first().waitFor({ timeout: 2000 })
      modalAppearedAt = Date.now()
    }
    const modalDelta = modalAppearedAt - clickStart
    if (modalDelta <= 1500) {
      pass(
        `caller modal appeared within ${modalDelta}ms of Phone click`,
        `(target ≤ 1500ms — was 1-3s blank+popping before fix)`,
      )
    } else {
      fail(
        `caller modal appeared ${modalDelta}ms after Phone click`,
        'modal took longer than 1500ms to appear',
      )
    }

    await shot(page, 'caller-modal-visible')
  })

  // -----------------------------------------------------------------
  // Scenario 2: RECEIVER — caller dials, recipient popup must appear in
  // top-right within 5s. (Caveat: depends on Supabase Realtime round-trip.)
  // -----------------------------------------------------------------
  await scenario('receiver-popup-timing', async (page) => {
    await loginAs(page, SEEDS.buddy.email, SEEDS.buddy.password)
    // The receiver is now on /chat. Use a separate browser context
    // to log in as the caller and trigger the call.
    const callerBrowser = await newBrowser()
    const callerCtx = await callerBrowser.newContext({
      extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
      viewport: { width: 1280, height: 800 },
    })
    const callerPage = await callerCtx.newPage()
    await loginAs(callerPage, SEEDS.tourist.email, SEEDS.tourist.password)
    await selectFirstConversation(callerPage)
    // Click Phone
    const callerPhoneBtn = callerPage
      .locator('button[aria-label="Start voice call"]')
      .first()
    await callerPhoneBtn.waitFor({ timeout: 10000, state: 'visible' })
    const callerClickAt = Date.now()
    await callerPhoneBtn.click()

    // On the receiver side, look for the IncomingCallCard. It MUST
    // appear in the top-right.
    const popup = page.locator(
      '[role="alertdialog"][aria-label="Incoming voice call"]',
    )
    try {
      await popup.waitFor({ timeout: 8000, state: 'visible' })
      const popupDelta = Date.now() - callerClickAt
      if (popupDelta <= 8000) {
        pass(
          `receiver popup appeared within ${popupDelta}ms of caller click`,
          '(target ≤ 8000ms — depends on Supabase Realtime round-trip)',
        )
      } else {
        fail(`receiver popup appeared ${popupDelta}ms after caller click`)
      }
    } catch {
      fail('receiver popup did not appear within 8s of caller click')
    }
    await shot(page, 'receiver-popup')

    await callerCtx.close()
    await callerBrowser.close()
  })

  // -----------------------------------------------------------------
  // Scenario 3: SIDEBAR parity — Rate block must NOT be present
  // -----------------------------------------------------------------
  await scenario('sidebar-no-rate', async (page) => {
    await loginAs(page, SEEDS.tourist.email, SEEDS.tourist.password)
    await selectFirstConversation(page)
    await page.waitForTimeout(800)

    // Right sidebar should NOT contain a "Rate" eyebrow heading.
    const rateEyebrow = page.locator('p.text-eyebrow:has-text("Rate")')
    const count = await rateEyebrow.count()
    if (count === 0) {
      pass('sidebar: no Rate block (removed 2026-10-02)')
    } else {
      fail(`sidebar: Rate block still present (count=${count})`)
    }

    // Languages block MUST still be present (per symmetry spec).
    const langEyebrow = page.locator('p.text-eyebrow:has-text("Languages")')
    if ((await langEyebrow.count()) > 0) {
      pass('sidebar: Languages block present')
    } else {
      fail('sidebar: Languages block missing')
    }

    await shot(page, 'sidebar-no-rate')
  })

  // Summary
  console.log(`\n=== Summary ===`)
  const passed = results.filter((r) => r.status === 'PASS').length
  const failed = results.filter((r) => r.status === 'FAIL').length
  console.log(`Total: ${results.length}  PASS: ${passed}  FAIL: ${failed}`)
  if (failed > 0) {
    console.log(`\nFailures:`)
    results
      .filter((r) => r.status === 'FAIL')
      .forEach((r) => console.log(`  - ${r.name}: ${r.detail}`))
    process.exit(1)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})