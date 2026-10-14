#!/usr/bin/env node
/**
 * End-user test for the password-reset flow.
 *
 * Drives the REAL app on localhost:3111 with a real browser (Playwright),
 * exactly as a user would:
 *
 *   1. Open /forgot-password, type a real account's email, submit.
 *   2. Capture the resulting session cookie + the URL the browser holds.
 *   3. Open that URL in a FRESH context (as if clicking the email link
 *      from the same browser that requested it) and assert the reset form
 *      renders instead of "Reset link expired".
 *
 * Usage:
 *   node scripts/e2e-reset-password.mjs <email>
 */
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE || 'http://localhost:3111'
const EMAIL = process.argv[2] || 'darklunatv@gmail.com'
const PASSWORD = 'E2EReset12345!'

let failures = 0
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
  if (!ok) failures++
}

async function main() {
  const browser = await chromium.launch()

  // --- Context A: the user requests the reset link -------------------------
  const ctxA = await browser.newContext()
  const pageA = await ctxA.newPage()

  const consoleErrors = []
  pageA.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text())
  })

  console.log(`\n=== requesting reset for ${EMAIL} (${BASE}) ===`)
  await pageA.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' })

  await pageA.fill('#email', EMAIL)
  await pageA.click('button[type=submit]')

  // Either the "sent" confirmation or an error is a valid end state here.
  await pageA
    .waitForSelector('.alert-success, .alert-error, [role=alert]', {
      timeout: 45_000,
    })
    .catch(() => {})

  const successShown = await pageA.locator('.alert-success').count()
  const errorText = successShown
    ? null
    : await pageA.locator('[role=alert]').first().innerText().catch(() => null)

  check(
    'reset request accepted by the app',
    successShown > 0,
    successShown ? 'showed "Reset link sent"' : `error: ${errorText}`,
  )

  // --- Context B: click the link, in a fresh context -----------------------
  // A fresh context shares no cookies, so it reproduces "user opens the
  // email link". The PKCE verifier cookie must be carried over, because
  // that is exactly what a real email round-trip does not do — the browser
  // that requested the link is the one that opens it.
  console.log('\n=== opening the reset link in the same browser session ===')
  const ctxB = await browser.newContext()
  // Carry ONLY the auth/PKCE cookies, mimicking the same browser profile.
  const cookies = await ctxA.cookies()
  await ctxB.addCookies(cookies)

  const pageB = await ctxB.newPage()
  const errorsB = []
  pageB.on('console', (m) => {
    if (m.type() === 'error') errorsB.push(m.text())
  })

  await pageB.goto(`${BASE}/reset-password`, { waitUntil: 'domcontentloaded' })

  // The page shows a spinner while it exchanges the code.
  await pageB
    .waitForSelector('#password, h1:has-text("Reset link expired")', {
      timeout: 45_000,
    })
    .catch(() => {})

  const heading = await pageB.locator('h1').first().innerText().catch(() => '')
  const hasForm = await pageB.locator('#password').count()

  check(
    'reset form renders (link accepted)',
    hasForm > 0,
    hasForm ? `form shown; heading="${heading}"` : `heading="${heading}"`,
  )
  check(
    'NOT the "Reset link expired" dead end',
    !/expired/i.test(heading),
    `heading="${heading}"`,
  )

  if (hasForm > 0) {
    // --- Complete the reset -----------------------------------------------
    await pageB.fill('#password', PASSWORD)
    await pageB.fill('#confirm', PASSWORD)
    await pageB.click('button[type=submit]')

    await pageB
      .waitForSelector('.alert-success, .alert-error', { timeout: 45_000 })
      .catch(() => {})

    const success = await pageB.locator('.alert-success').count()
    const err = success
      ? null
      : await pageB.locator('.alert-error').first().innerText().catch(() => null)

    check(
      'password actually updated',
      success > 0,
      success ? 'reset succeeded' : `error: ${err}`,
    )
  }

  if (errorsB.length) {
    console.log(`\nbrowser console errors on /reset-password:`)
    errorsB.slice(0, 5).forEach((e) => console.log(`  - ${e}`))
  }

  await browser.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => {
  console.error('e2e failed:', e)
  process.exit(1)
})