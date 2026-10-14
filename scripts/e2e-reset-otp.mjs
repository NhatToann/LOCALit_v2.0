#!/usr/bin/env node
/**
 * END-USER TEST for the emailed-OTP password reset (2026-10-11).
 *
 * Drives a real browser through exactly what a person does:
 *
 *   /forgot-password  → enter email → "Send reset code"
 *   → "Enter the code" → type the 6 digits → "Verify code"
 *   → type a new password twice → "Set new password"
 *   → land on /login → sign in with the NEW password
 *
 * The final sign-in is the assertion that matters: it proves the hash was
 * actually written to auth.users, not just that the UI showed a green box.
 *
 * The code is read from the API's __devCode field (OTP_PREVIEW=true, dev
 * only), which is how a user reads it out of their email.
 *
 * Usage: node scripts/e2e-reset-otp.mjs <email> <oldPw> <newPw>
 */
import { chromium } from 'playwright'

const BASE = process.env.E2E_BASE || 'http://localhost:3111'
const EMAIL = process.argv[2]
const OLD_PW = process.argv[3]
const NEW_PW = process.argv[4]

if (!EMAIL || !OLD_PW || !NEW_PW) {
  console.error('usage: node scripts/e2e-reset-otp.mjs <email> <oldPw> <newPw>')
  process.exit(2)
}

let failures = 0
const ok = (name, pass, detail = '') => {
  console.log(`${pass ? 'PASS' : 'FAIL'}: ${name}${detail ? ` — ${detail}` : ''}`)
  if (!pass) failures++
}

const SUPA = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

/** Direct GoTrue sign-in — proves the password really changed. */
async function gotrueSignIn(password) {
  const r = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password }),
  })
  return r.status === 200
}

async function main() {
  const browser = await chromium.launch()
  // Clipboard permissions are REQUIRED: without them navigator.clipboard
  // rejects and the Ctrl+V paste delivers an empty string, which looks
  // exactly like an app bug but is not one.
  const ctx = await browser.newContext({
    permissions: ['clipboard-read', 'clipboard-write'],
  })
  const page = await ctx.newPage()

  const jsErrors = []
  page.on('pageerror', (e) => jsErrors.push(e.message))

  // --- baseline: the OLD password works, so a later failure is ours ------
  ok('baseline — old password signs in', await gotrueSignIn(OLD_PW))

  // --- step 1: /forgot-password -----------------------------------------
  console.log('\n=== 1. /forgot-password ===')
  await page.goto(`${BASE}/forgot-password`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('#email', { timeout: 30_000 })
  await page.fill('#email', EMAIL)
  // Capture the /start response as the user clicks, so we read the real dev
  // code without spending a second request (the endpoint is 3/min).
  const startPromise = page.waitForResponse(
    (r) => r.url().includes('/api/auth/reset-otp/start') && r.request().method() === 'POST',
    { timeout: 45_000 },
  )
  await page.click('button[type=submit]')

  const startRes = await startPromise
  const startJson = await startRes.json().catch(() => ({}))

  await page
    .waitForSelector('.alert-success, .alert-error', { timeout: 45_000 })
    .catch(() => {})
  const sentOk = await page.locator('.alert-success').count()
  ok('reset code request accepted', sentOk > 0,
     sentOk ? (await page.locator('.alert-success').innerText()).replace(/\s+/g,' ').slice(0,70) : await page.locator('.alert-error').innerText().catch(()=> 'no response'))

  // --- step 2: read the code (stands in for the email inbox) ------------
  const code = startJson.__devCode
  const resetId = startJson.resetId
  ok('code issued (dev preview)', !!code, `__devCode=${code}`)
  ok('resetId issued', !!resetId, `resetId=${resetId}`)

  // --- step 3: click through to /reset-password -------------------------
  console.log('\n=== 2. /reset-password — enter code ===')
  const enterBtn = page.locator('button', { hasText: 'Enter the code' }).first()
  await enterBtn.click()
  await page.waitForURL(/\/reset-password/, { timeout: 20_000 })
  ok('navigated to /reset-password', /\/reset-password/.test(page.url()))

  await page.waitForSelector('input[aria-label="Digit 1"]', { timeout: 20_000 })
  const boxes = await page.locator('input[aria-label^="Digit"]').count()
  ok('six code boxes rendered', boxes === 6, `count=${boxes}`)

  // Paste behaviour: a user copies the code from the email and pastes it.
  await page.locator('input[aria-label="Digit 1"]').focus()
  await page.evaluate(
    (c) => navigator.clipboard.writeText(c),
    String(code),
  )
  await page.keyboard.press('Control+V')
  await page.waitForTimeout(400)
  const filled = await page.locator('input[aria-label^="Digit"]').evaluateAll(
    (els) => els.map((e) => e.value).join(''),
  )
  ok('paste fills all six boxes', filled === code, `got "${filled}" want "${code}"`)

  await page.locator('button', { hasText: 'Verify code' }).first().click()
  await page
    .waitForSelector('#password, .alert-error', { timeout: 45_000 })
    .catch(() => {})
  const hasPw = await page.locator('#password').count()
  ok('code accepted → password form shown', hasPw > 0,
     hasPw ? 'form rendered' : await page.locator('.alert-error').innerText().catch(()=>'no error shown'))

  // --- step 4: set the new password -------------------------------------
  if (hasPw > 0) {
    console.log('\n=== 3. set the new password ===')
    await page.fill('#password', NEW_PW)
    await page.fill('#confirm', NEW_PW)
    await page.locator('button', { hasText: 'Set new password' }).first().click()

    await page.waitForSelector('.alert-success, .alert-error', { timeout: 45_000 }).catch(() => {})
    const saved = await page.locator('.alert-success').count()
    ok('password change accepted', saved > 0,
       saved ? 'success shown' : await page.locator('.alert-error').innerText().catch(()=>'?'))

    // --- the assertion that actually proves it ---------------------------
    ok('NEW password signs in', await gotrueSignIn(NEW_PW))
    ok('OLD password no longer works', !(await gotrueSignIn(OLD_PW)))
  }

  // --- replay protection ------------------------------------------------
  console.log('\n=== 4. replay the same code ===')
  const replay = await page.evaluate(
    async ({ resetId, code }) => {
      const r = await fetch('/api/auth/reset-otp/verify', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ resetId, code }),
      })
      return { status: r.status, json: await r.json().catch(() => ({})) }
    },
    { resetId, code },
  )
  ok('used code cannot be reused', replay.status === 410, `status=${replay.status} ${replay.json.reason ?? ''}`)

  if (jsErrors.length) {
    console.log('\nuncaught JS errors:')
    jsErrors.slice(0, 5).forEach((e) => console.log('  -', e))
  }

  await browser.close()
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`)
  process.exit(failures === 0 ? 0 : 1)
}

main().catch((e) => { console.error('e2e crashed:', e); process.exit(1) })