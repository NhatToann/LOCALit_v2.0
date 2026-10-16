// scripts/test-register-e2e.mjs
// End-to-end test of the /register flow against the LOCAL dev server.
// Dev server is expected to be running on http://localhost:3344 with
// OTP_PREVIEW=true (echoes code in __devCode so we can complete the
// flow without checking email).
//
// Walks: account → verify-otp → profile → dashboard, then signs in
// fresh and confirms /dashboard is reachable.

import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
const email = `e2e.reg.${Date.now()}@gmail.com`
const password = 'TestPass#Reg2026'
const fullName = 'E2E Reg Test'
const role = 'tourist'

console.log('TEST: e2e register flow against', BASE)
console.log('email:', email, 'role:', role)

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

const consoleErrors = []
page.on('console', (m) => {
  if (m.type() === 'error') {
    consoleErrors.push(m.text())
  }
})
const pageErrors = []
page.on('pageerror', (e) => pageErrors.push(String(e)))

let pass = 0
let fail = 0
function check(label, ok, extra) {
  if (ok) {
    console.log('  PASS:', label, extra ? JSON.stringify(extra) : '')
    pass++
  } else {
    console.log('  FAIL:', label, extra ? JSON.stringify(extra) : '')
    fail++
  }
}

// Warm up the dev server (Turbopack compiles on first request — without
// a warm-up, the first goto can take >30s and trip Playwright's default).
console.log('warming up dev server...')
const warmupStart = Date.now()
try {
  await fetch(`${BASE}/register`, { signal: AbortSignal.timeout(60_000) })
  console.log('warmup: register page ok')
} catch (e) {
  console.log('warmup: register page error (continuing):', e.message)
}
console.log('warmup done in', Date.now() - warmupStart, 'ms')

const navStart = await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 90_000 })
check('GET /register returns 200', navStart.status() === 200, { status: navStart.status() })
await page.waitForSelector('text=Create your account', { timeout: 10_000 })
check('Step 1 "Create your account" header visible', true)

// 2) Fill account form
await page.fill('#fullName', fullName)
await page.fill('#phone', '+84 901 234 567')
await page.fill('#email', email)
await page.fill('#password', password)
await page.fill('#confirmPassword', password)
// pick tourist (default already, but be explicit)
await page.getByRole('button', { name: /Tourist/i }).first().click()
await page.check('input[type="checkbox"]')

// 3) Submit (this hits /api/auth/signup/start)
const respPromise = page.waitForResponse(
  (r) => r.url().includes('/api/auth/signup/start') && r.request().method() === 'POST',
  { timeout: 15_000 },
)
await page.getByRole('button', { name: /Send verification code/i }).click()
const startResp = await respPromise
const startJson = await startResp.json().catch(() => ({}))
check('POST /signup/start returns 200', startResp.status() === 200, { status: startResp.status() })
check('signup/start returns signupId', !!startJson.signupId, { signupId: startJson.signupId })
check('signup/start returns __devCode (dev mode)', typeof startJson.__devCode === 'string' && /^\d{6}$/.test(startJson.__devCode), { code: startJson.__devCode })

// 4) Wait for Step 2 (verify-otp)
await page.waitForSelector('text=Check your email', { timeout: 10_000 })
check('Step 2 "Check your email" header visible', true)

// 5) Fill the 6-digit boxes
const code = startJson.__devCode
for (let i = 0; i < 6; i++) {
  await page.fill(`input[aria-label="Digit ${i + 1}"]`, code[i])
}

// 6) Submit verify-otp
const verifyRespPromise = page.waitForResponse(
  (r) => r.url().includes('/api/auth/signup/verify-otp') && r.request().method() === 'POST',
  { timeout: 10_000 },
)
await page.getByRole('button', { name: /Verify and continue/i }).click()
const verifyResp = await verifyRespPromise
const verifyJson = await verifyResp.json().catch(() => ({}))
check('POST /signup/verify-otp returns 200', verifyResp.status() === 200, { status: verifyResp.status(), body: verifyJson })

// 7) Step 3 (profile) — pick tourist fields
await page.waitForSelector('text=Tell us about your trip', { timeout: 10_000 })
check('Step 3 "Tell us about your trip" header visible', true)

await page.selectOption('#nationality', 'United States')
await page.selectOption('#travelStyle', 'solo')
// interests — pick "Food" and "Photography"
await page.getByRole('button', { name: /^Food$/ }).click()
await page.getByRole('button', { name: /^Photography$/ }).click()
// languages — pick English
await page.getByRole('button', { name: /^English$/ }).click()

// 8) Click "Create account" (this hits /api/auth/signup/complete)
const completeRespPromise = page.waitForResponse(
  (r) => r.url().includes('/api/auth/signup/complete') && r.request().method() === 'POST',
  { timeout: 30_000 },
)
await page.getByRole('button', { name: /^Create account$/i }).click()
const completeResp = await completeRespPromise
const completeJson = await completeResp.json().catch(() => ({}))
check('POST /signup/complete returns 200', completeResp.status() === 200, { status: completeResp.status(), body: completeJson })
check('signup/complete returns userId', typeof completeJson.userId === 'string', { userId: completeJson.userId })

// 9) After complete, client signs in and navigates to /dashboard
await page.waitForURL(/\/dashboard$/, { timeout: 30_000 })
check('navigated to /dashboard after sign-in', page.url().endsWith('/dashboard'), { url: page.url() })

// 10) Page console errors check
check('no page errors', pageErrors.length === 0, { pageErrors })
check('no console errors', consoleErrors.length === 0, {
  errors: consoleErrors.slice(0, 5),
})

await page.screenshot({ path: 'scripts/screenshots/register-e2e-final.png', fullPage: true })

// 11) DB check
const { Client } = await import('pg')
const c = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await c.connect()
const u = await c.query("SELECT id, email FROM auth.users WHERE email = $1", [email])
check('auth.users has new row', u.rows.length === 1, { rows: u.rows })
const p = await c.query("SELECT id, email, role, full_name FROM public.profiles WHERE email = $1", [email])
check('public.profiles has new row', p.rows.length === 1, { rows: p.rows })
const t = await c.query("SELECT id, nationality, interests, languages FROM public.tourists WHERE id = $1", [p.rows[0]?.id])
check('public.tourists has new row', t.rows.length === 1, { rows: t.rows })
const ev = await c.query("SELECT consumed_at, verified_at FROM public.email_verifications WHERE email = $1", [email])
check('email_verifications row consumed', ev.rows.length > 0 && ev.rows.some((r) => r.consumed_at != null), { rows: ev.rows })
await c.end()

await browser.close()

console.log(`\n=== Result: ${pass} pass / ${fail} fail ===`)
process.exit(fail === 0 ? 0 : 1)
