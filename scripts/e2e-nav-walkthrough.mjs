// End-user walkthrough against the deployed domain.
// Signs in as a real user, then exercises the navbar and the account
// menu the way a person would: click, wait, look, screenshot.
import { chromium } from 'playwright'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE_URL || 'https://localit-vn.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const EMAIL = process.env.EMAIL || 'lan.pham@localit.dev'
const PW = process.env.PW || 'password123'
const SHOTS = 'scripts/screenshots/e2e-nav'

mkdirSync(SHOTS, { recursive: true })

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
  })
  const page = await ctx.newPage()

  const errors = []
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 110)}`))
  page.on('console', (m) => {
    if (m.type() === 'error' && !/401|Failed to load resource/.test(m.text())) {
      errors.push(`console: ${m.text().slice(0, 110)}`)
    }
  })

  let pass = 0, fail = 0
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ` — ${extra}` : ''}`)
    ok ? pass++ : fail++
    return ok
  }

  const clean = () => page.url().replace(BASE, '') || '/'
  const step = async (n) => {
    await page.waitForTimeout(1200)
    await page.screenshot({ path: `${SHOTS}/${String(n).padStart(2, '0')}-${n}.png` })
  }

  // ============ SIGN IN ============
  console.log('\n── SIGN IN ──')
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await step('01-guest-home')

  await page.click('a[href="/login"]')
  await page.waitForTimeout(3500)
  check('Sign in from homepage opens the form', page.url().includes('/login'), clean())
  await step('02-login-form')

  await page.fill('input[type=email]', EMAIL)
  await page.fill('input[type=password]', PW)
  await step('03-login-filled')
  await page.click('button[type=submit]')
  await page.waitForTimeout(9000)
  check('sign-in lands on the dashboard', page.url().includes('/dashboard'), clean())
  await step('04-dashboard')

  // The navbar must reflect the signed-in state, not the guest links.
  // The guest "Sign in" CTA must be gone from the header itself. A
// /login link elsewhere on the page (empty state, footer) is fine, so
  // scope the check to the header bar.
  const nav = await page.evaluate(() => {
    const bar = document.querySelector('nav[aria-label="Primary"]')
    const header = document.querySelector('header')
    return {
      labels: [...(bar?.querySelectorAll('a') ?? [])].map((a) => a.textContent.trim().split('\n')[0]),
      headerHasSignIn: [...(header?.querySelectorAll('a') ?? [])].some(
        (a) => a.textContent.trim() === 'Sign in',
      ),
      hasAvatar: !!document.querySelector('button[aria-label="Open account menu"]'),
    }
  })
  check('navbar shows the logged-in links', nav.labels.length === 5, JSON.stringify(nav.labels))
  check('guest "Sign in" button is gone from the header', !nav.headerHasSignIn)
  check('account avatar button is present', nav.hasAvatar)

  // ============ NAVBAR ============
  console.log('\n── NAVBAR (desktop) ──')
  // Walk every link in the real bar, in the order a user would.
  for (const [i, path] of ['/swipe', '/browse', '/trips', '/chat', '/dashboard'].entries()) {
    const before = clean()
    const href = `nav[aria-label="Primary"] a[href="${path}"]`
    const el = await page.$(href)
    if (!el) {
      check(`navbar link ${path} exists`, false)
      continue
    }
    await el.click()
    await page.waitForTimeout(4500)
    const after = clean()

    // Two destinations are reached indirectly, and both are correct:
    //  - /trips is 308-redirected to /itinerary by the middleware.
    //  - /swipe is tourist-only. Lan is a buddy, so the page hands off
    //    to /likes.
    const expected = path === '/trips' ? '/itinerary' : path
    const accepted = [expected, '/likes']
    check(
      `click "${path}" navigates`,
      accepted.some((e) => after.startsWith(e)),
      `${before} -> ${after}${after.startsWith('/likes') ? ' (buddy → /likes, by design)' : after.startsWith('/itinerary') ? ' (middleware 308)' : ''}`,
    )

    // The destination must render real content, not a stuck spinner.
    // Poll rather than sampling once — these pages fetch after mount.
    let settled = await page.evaluate(() => ({
      spinner: !!document.querySelector('.loading-spinner'),
      text: (document.querySelector('main')?.textContent || '').trim().length,
    }))
    for (let t = 0; t < 10 && (settled.spinner || settled.text < 80); t++) {
      await page.waitForTimeout(1000)
      settled = await page.evaluate(() => ({
        spinner: !!document.querySelector('.loading-spinner'),
        text: (document.querySelector('main')?.textContent || '').trim().length,
      }))
    }
    check(
      `"${path}" renders content`,
      !settled.spinner && settled.text > 80,
      `spinner=${settled.spinner} textLen=${settled.text}`,
    )
    await step(`05-nav-${i + 1}-${path.replace(/\//g, '')}`)
  }

  // Highlight the active-state styling on the current page.
  const activeMark = await page.evaluate(() => {
    const cur = document.querySelector('nav[aria-label="Primary"] a[aria-current="page"]')
    return cur ? cur.textContent.trim().split('\n')[0] : null
  })
  check('active nav item is marked aria-current', activeMark !== null, String(activeMark))

  // ============ USER MENU -> PROFILE ============
  console.log('\n── ACCOUNT MENU ──')
  await page.click('button[aria-label="Open account menu"]')
  await page.waitForTimeout(1200)
  const menu = await page.evaluate(() => {
    const m = document.querySelector('[role="menu"]')
    if (!m) return null
    return {
      items: [...m.querySelectorAll('[role="menuitem"]')].map((i) => i.textContent.trim()),
      expanded: document.querySelector('button[aria-label="Open account menu"]')?.getAttribute('aria-expanded'),
      // Is the menu actually on top at its own coordinates?
      onTop: (() => {
        const first = m.querySelector('[role="menuitem"]')
        if (!first) return 'NO ITEM'
        const r = first.getBoundingClientRect()
        const top = document.elementFromPoint(r.left + 10, r.top + r.height / 2)
        return top && m.contains(top) ? 'YES' : `BLOCKED BY ${top?.tagName}`
      })(),
    }
  })
  check('account menu opens', menu !== null)
  check('menu lists the expected items', (menu?.items.length ?? 0) === 3, JSON.stringify(menu?.items))
  check('menu is clickable (not covered)', menu?.onTop === 'YES', String(menu?.onTop))
  check('menu button reports aria-expanded=true', menu?.expanded === 'true', String(menu?.expanded))
  await step('06-account-menu')

  // Click "My Profile" the way a user does.
  const profileLink = await page.$('[role="menu"] a[href="/profile"]')
  check('"My Profile" item is present', !!profileLink)
  if (profileLink) {
    await profileLink.click()
    await page.waitForTimeout(6000)
    check('"My Profile" opens the profile page', clean().startsWith('/profile'), clean())

    const prof = await page.evaluate(() => ({
      spinner: !!document.querySelector('.loading-spinner'),
      nameShown: /lan|pham/i.test(document.body.textContent || ''),
      textLen: (document.querySelector('main')?.textContent || '').trim().length,
      hasPublicLink: !![...document.querySelectorAll('a')].find((a) => /public|share/i.test(a.textContent || '')),
    }))
    check('profile renders without a stuck spinner', !prof.spinner, `spinner=${prof.spinner}`)
    check('profile shows the signed-in user', prof.nameShown)
    check('profile page has real content', prof.textLen > 150, `textLen=${prof.textLen}`)
    await step('07-profile')
  }

  // The menu must close after navigating.
  const menuClosed = await page.evaluate(() => !document.querySelector('[role="menu"]'))
  check('menu closes after choosing an item', menuClosed)

  // ============ ROUND TRIP ============
  console.log('\n── NAV BACK TO DASHBOARD ──')
  await page.click('nav[aria-label="Primary"] a[href="/dashboard"]')
  await page.waitForTimeout(4500)
  check('can navigate away from profile', clean() === '/dashboard', clean())

  // ============ KEYBOARD ============
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  const focused = await page.evaluate(() => {
    const el = document.activeElement
    return { tag: el?.tagName, text: (el?.textContent || '').trim().slice(0, 40), href: el?.getAttribute?.('href') }
  })
  check('keyboard focus reaches a nav item', focused.tag === 'A', JSON.stringify(focused))

  await page.screenshot({ path: `${SHOTS}/08-final.png` })

  console.log(`\n${pass} passed, ${fail} failed`)
  if (errors.length) console.log(`[errors] ${JSON.stringify([...new Set(errors)].slice(0, 6), null, 1)}`)
  await browser.close()
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})