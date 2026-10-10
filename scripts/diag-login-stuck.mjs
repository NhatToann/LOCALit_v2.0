// Reproduce: can the user actually sign in on /login?
// Clicks the real Sign in button and reports whether it lands on
// /dashboard or bounces back to /login (the redirect loop).
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
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

  const nav = []
  page.on('framenavigated', (f) => {
    if (f === page.mainFrame()) nav.push(f.url().replace(BASE, ''))
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  await page.fill('input[type=email]', 'lan.pham@localit.dev')
  await page.fill('input[type=password]', 'password123')

  // Any overlay sitting on top of the button will swallow the click.
  const hit = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) =>
      /sign in/i.test(b.textContent || ''),
    )
    if (!btn) return { found: false }
    const r = btn.getBoundingClientRect()
    const cx = r.left + r.width / 2
    const cy = r.top + r.height / 2
    const top = document.elementFromPoint(cx, cy)
    return {
      found: true,
      rect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
      topElement: top ? `${top.tagName}.${String(top.className).slice(0, 50)}` : null,
      isButtonOrChild: !!(top && (top === btn || btn.contains(top))),
      disabled: btn.disabled,
      pointerEvents: getComputedStyle(btn).pointerEvents,
    }
  })
  console.log(`[button] ${JSON.stringify(hit)}`)

  await page.click('button[type=submit]', { timeout: 8000 }).catch((e) =>
    console.log(`[click] FAILED: ${e.message.slice(0, 80)}`),
  )

  // Give the auth round-trip + any redirect time to resolve.
  await page.waitForTimeout(9000)

  const final = await page.url().replace(BASE, '')
  const cookie = (await ctx.cookies(BASE)).find((c) => /auth-token$/.test(c.name))
  console.log(`[after] landed on ${final}`)
  console.log(`[after] session cookie present=${!!cookie}`)
  console.log(`[navigations] ${JSON.stringify(nav.slice(0, 12))}`)

  await page.screenshot({ path: 'scripts/screenshots/diag-login-stuck.png' })
  console.log(final.includes('/login') ? '\nRESULT: BOUNCED BACK TO /login — broken' : '\nRESULT: signed in — OK')

  await browser.close()
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})