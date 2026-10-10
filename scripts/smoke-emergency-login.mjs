// Final verification of the emergency fix on the deployed domain.
// 1. A guest with a dead cookie can still browse public pages.
// 2. Clicking Sign in reaches a real, fillable form.
// 3. Signing in works and lands on the dashboard.
// 4. A signed-in user is not ejected from any page.
// 5. The expiry banner explains the redirect.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-vn.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const EMAIL = 'lan.pham@localit.dev'
const PW = 'password123'

const poison = async (ctx) => {
  const sess = (await ctx.cookies(BASE)).find((c) => /auth-token$/.test(c.name))
  if (!sess) return false
  const body = decodeURIComponent(sess.value).replace(/^base64-/, '')
  try {
    const p = JSON.parse(Buffer.from(body, 'base64').toString('utf8'))
    p.access_token = p.access_token.slice(0, -12) + 'TAMPEREDXX'
    p.refresh_token = 'REVOKED'
    p.expires_at = 1
    p.expires_in = 1
    await ctx.addCookies([
      {
        name: sess.name,
        value: `base64-${Buffer.from(JSON.stringify(p), 'utf8').toString('base64')}`,
        domain: sess.domain,
        path: sess.path,
      },
    ])
    return true
  } catch {
    return false
  }
}

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
  })
  const page = await ctx.newPage()
  let pass = 0, fail = 0
  const check = (n, ok, x = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${n}${x ? ` — ${x}` : ''}`)
    ok ? pass++ : fail++
  }

  // --- sign in to obtain a session ---
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForTimeout(8000)
  check('baseline sign-in works', page.url().includes('/dashboard'), page.url().replace(BASE, ''))

  // --- 1+2: guest with a dead cookie is NOT ejected; Sign in works ---
  check('cookie poisoned', await poison(ctx))
  for (const pub of ['/', '/browse', '/map']) {
    await page.goto(`${BASE}${pub}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(6000)
    const p = page.url().replace(BASE, '')
    check(`public page ${pub} stays put for a dead session`, !p.startsWith('/login'), p)
  }

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(4000)
  const si = await page.$('a[href*="/login"]')
  if (si) await si.click({ timeout: 6000 }).catch(() => {})
  await page.waitForTimeout(4000)
  const onLogin = page.url().includes('/login')
  const hasForm = await page.evaluate(() => !!document.querySelector('input[type=password]'))
  check('Sign in link reaches the login form', onLogin, page.url().replace(BASE, ''))
  check('login form is fillable (password input present)', hasForm)

  // --- 5: expiry banner ---
  // Asserted separately, on the path that actually triggers it. Landing
  // on /login by clicking the header link is a cold visit and must NOT
  // claim the session expired, so no banner is the correct result there.
  const bannerOnColdVisit = await page.evaluate(() =>
    /session expired/i.test(document.body.textContent || ''),
  )
  check('no false banner when reaching /login by choice', !bannerOnColdVisit)

  await page.goto(`${BASE}/login?redirectTo=%2Fdashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)
  const banner = await page.evaluate(() =>
    /session expired/i.test(document.body.textContent || ''),
  )
  check('expired-session banner explains the redirect', banner)

  // --- 3: sign in from the expired state ---
  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PW)
  await page.click('button[type=submit]')
  await page.waitForTimeout(10000)
  check('can sign in again after expiry', page.url().includes('/dashboard'), page.url().replace(BASE, ''))

  // --- 4: signed-in user is not ejected from protected pages ---
  for (const priv of ['/dashboard', '/chat', '/trips', '/profile']) {
    await page.goto(`${BASE}${priv}`, { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(5500)
    const p = page.url().replace(BASE, '')
    check(`signed-in user stays on ${priv}`, !p.startsWith('/login'), p)
  }

  // --- navigation responsiveness ---
  await page.goto(`${BASE}/dashboard`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)
  const navOk = await page.evaluate(async () => {
    const link = document.querySelector('a[href="/browse"], a[href="/trips"]')
    if (!link) return 'NO LINK'
    link.click()
    await new Promise((r) => setTimeout(r, 3500))
    return location.pathname
  })
  check('navbar navigation works', navOk !== 'NO LINK' && !navOk.startsWith('/login'), String(navOk))

  await page.screenshot({ path: 'scripts/screenshots/verify-emergency-fixed.png' })
  console.log(`\n${pass} passed, ${fail} failed`)
  await browser.close()
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})