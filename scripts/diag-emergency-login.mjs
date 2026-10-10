// Reproduce the reported emergency: user holds a dead session cookie,
// lands on the homepage, and cannot sign in.
//
// This mirrors the deployed guard's failure mode: on a PUBLIC route it
// still checks the session and fires the /login redirect, and it patches
// window.fetch on every mount.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-vn.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
  })
  const page = await ctx.newPage()

  const pageErrors = []
  page.on('pageerror', (e) => pageErrors.push(e.message.slice(0, 120)))
  const consoleErrors = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 140))
  })

  const nav = []
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) nav.push(f.url().replace(BASE, '') || '/')
  })

  // --- 1. sign in normally to get a real session cookie ---
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)
  await page.fill('input[type=email]', 'lan.pham@localit.dev')
  await page.fill('input[type=password]', 'password123')
  await page.click('button[type=submit]')
  await page.waitForTimeout(8000)
  console.log(`[1] signed in, landed on ${page.url().replace(BASE, '')}`)

  // --- 2. poison the cookie: dead access token, revoked refresh token ---
  const sess = (await ctx.cookies(BASE)).find((c) => /auth-token$/.test(c.name))
  const body = decodeURIComponent(sess.value).replace(/^base64-/, '')
  const parsed = JSON.parse(Buffer.from(body, 'base64').toString('utf8'))
  parsed.access_token = parsed.access_token.slice(0, -12) + 'TAMPEREDXX'
  parsed.refresh_token = 'REVOKED'
  parsed.expires_at = 1
  parsed.expires_in = 1
  await ctx.addCookies([
    {
      name: sess.name,
      value: `base64-${Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64')}`,
      domain: sess.domain,
      path: sess.path,
    },
  ])
  console.log('[2] cookie poisoned (dead token + revoked refresh)')

  // --- 3. land on the PUBLIC homepage, like a returning visitor ---
  nav.length = 0
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(9000)

  const home = await page.evaluate(() => ({
    path: location.pathname + location.search,
    hasSignInBtn: [...document.querySelectorAll('a,button')].some((e) =>
      /sign in/i.test(e.textContent || ''),
    ),
    // Can a real user click the Sign in link?
    signInClickable: (() => {
      const el = [...document.querySelectorAll('a,button')].find((e) => /sign in/i.test(e.textContent || ''))
      if (!el) return 'NO ELEMENT'
      const r = el.getBoundingClientRect()
      if (r.width === 0 || r.height === 0) return 'ZERO SIZE'
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return top && (top === el || el.contains(top)) ? 'CLICKABLE' : `BLOCKED BY ${top?.tagName}.${String(top?.className).slice(0, 40)}`
    })(),
  }))
  console.log(`[3] homepage -> ${home.path}`)
  console.log(`[3] Sign in element: ${home.hasSignInBtn ? 'present' : 'MISSING'}, clickability: ${home.signInClickable}`)

  // --- 4. try to click Sign in and reach the form ---
  let clicked = false
  try {
    const link = await page.$('a[href*="/login"], button')
    const si = await page.$('a[href*="/login"]')
    if (si) {
      await si.click({ timeout: 6000 })
      clicked = true
    } else if (link) {
      await link.click({ timeout: 6000 })
      clicked = true
    }
  } catch (e) {
    console.log(`[4] CLICK THREW: ${e.message.slice(0, 100)}`)
  }
  await page.waitForTimeout(4000)
  console.log(`[4] click dispatched=${clicked}, now at ${page.url().replace(BASE, '')}`)

  // --- 5. can we actually sign in from here? ---
  if (page.url().includes('/login')) {
    await page.fill('input[type=email]', 'lan.pham@localit.dev')
    await page.fill('input[type=password]', 'password123')
    await page.click('button[type=submit]', { timeout: 8000 }).catch((e) =>
      console.log(`[5] submit click FAILED: ${e.message.slice(0, 80)}`),
    )
    await page.waitForTimeout(10000)
    console.log(`[5] after sign-in attempt -> ${page.url().replace(BASE, '')}`)
  }

  console.log(`\n[navigations] ${JSON.stringify(nav.slice(0, 14))}`)
  console.log(`[page errors] ${pageErrors.length ? JSON.stringify(pageErrors.slice(0, 4)) : 'none'}`)
  console.log(`[console errors] ${consoleErrors.length ? JSON.stringify([...new Set(consoleErrors)].slice(0, 5)) : 'none'}`)

  await page.screenshot({ path: 'scripts/screenshots/diag-emergency-login.png', fullPage: false })
  await browser.close()
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})