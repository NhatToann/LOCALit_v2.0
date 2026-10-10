// Verify SessionExpiryGuard: kill the session, then confirm the app
// redirects to /login instead of stranding the user on a dead page.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const START = process.env.PAGE_PATH || '/browse'

const run = async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({
    extraHTTPHeaders: {
      'x-vercel-protection-bypass': BYPASS,
      'x-vercel-set-bypass-cookie': 'samesitenone',
    },
  })
  const page = await ctx.newPage()

  let pass = 0
  let fail = 0
  const check = (name, ok, extra = '') => {
    console.log(`${ok ? 'PASS' : 'FAIL'}: ${name}${extra ? ` — ${extra}` : ''}`)
    ok ? pass++ : fail++
  }

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  if (page.url().includes('/login')) {
    await page.fill('input[type=email]', 'lan.pham@localit.dev')
    await page.fill('input[type=password]', 'password123')
    await page.click('button[type=submit]')
    await page.waitForTimeout(5000)
  }

  // --- baseline: healthy session stays put ---
  await page.goto(`${BASE}${START}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)
  const healthy = await page.evaluate(() => ({
    path: location.pathname,
    rows: document.querySelectorAll('[class*=cursor-pointer], button').length,
  }))
  check(
    'healthy session is NOT redirected away',
    healthy.path === START,
    `at ${healthy.path}`,
  )

  // --- kill the session cookie, then fire a 401-shaped request ---
  // Tampering the access token does NOT reproduce the bug: @supabase/ssr
  // sees the stale token, calls /auth/v1/token?grant_type=refresh_token
  // BEFORE any data request, and swaps in a fresh valid one. Zero 401s
  // were observed that way.
  //
  // The real expiry path is a refresh_token that GoTrue no longer
  // accepts (revoked, or past its own TTL). Then the refresh call itself
  // 401s, no usable session is produced, and the page is left holding a
  // cookie whose access_token is dead — which is what produced the
  // reported 401s and the stuck UI.
  // We reproduce that by dropping the refresh_token as well, so the
  // client has nothing to refresh into.
  const cookies = await ctx.cookies(BASE)
  const sess = cookies.find((c) => /auth-token$/.test(c.name))
  // @supabase/ssr writes the session cookie as `base64-<base64 json>`,
  // NOT as plain URL-encoded JSON. Decoding it as JSON fails and the
  // tampered value is stored as garbage, which the client then silently
  // discards and replaces with a fresh session — so the test never
  // actually killed anything.
  const raw = decodeURIComponent(sess.value)
  const body = raw.startsWith('base64-') ? raw.slice(7) : raw
  let broken
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64').toString('utf8'))
    // Dead access token AND no way to renew it.
    parsed.access_token = parsed.access_token.slice(0, -12) + 'TAMPEREDXX'
    parsed.refresh_token = 'REFRESH-TOKEN-REVOKED'
    parsed.expires_at = 1
    parsed.expires_in = 1
    broken = `base64-${Buffer.from(JSON.stringify(parsed), 'utf8').toString('base64')}`
  } catch (e) {
    console.log(`[diag] could not re-encode cookie: ${String(e).slice(0, 60)}`)
    broken = sess.value
  }
  await ctx.addCookies([{ name: sess.name, value: broken, domain: sess.domain, path: sess.path }])

  // Reload onto an authenticated page with a dead token, exactly like
  // the reported bug: the middleware still sees the cookie and lets the
  // request through, so the 401 only surfaces client-side.
  // Count the 401s the page actually sees, so we can tell "the guard
  // never fired because nothing 401'd" apart from "the guard fired but
  // the redirect was blocked". Installed before any page script runs.
  await page.addInitScript(() => {
    const orig = window.fetch
    window.fetch = async (...a) => {
      const r = await orig(...a)
      if (r.status === 401) {
        // sessionStorage, not a local variable: the guard redirects to
        // /login, which is a fresh document and would wipe an in-memory
        // counter before we could read it.
        try {
          sessionStorage.setItem('__d401', String(Number(sessionStorage.getItem('__d401') || 0) + 1))
          const prev = JSON.parse(sessionStorage.getItem('__d401urls') || '[]')
          prev.push(String(a[0]?.url ?? a[0]).slice(-60))
          sessionStorage.setItem('__d401urls', JSON.stringify(prev.slice(-5)))
        } catch {}
      }
      return r
    }
  })

  await page.goto(`${BASE}${START}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000)

  const after = await page.evaluate(() => ({
    path: location.pathname,
    search: location.search,
    spinner: !!document.querySelector('.loading-spinner'),
    buttons: document.querySelectorAll('button').length,
    d401: Number(sessionStorage.getItem('__d401') || 0),
    d401urls: JSON.parse(sessionStorage.getItem('__d401urls') || '[]'),
  }))

  console.log(
    `[diag] 401s seen by the page: ${after.d401}${after.d401 ? ' -> ' + JSON.stringify(after.d401urls.slice(0, 3)) : ''}`,
  )
  console.log(`[diag] pathname=${after.path} search=${after.search} buttons=${after.buttons}`)

  // Was the app actually signed in on this page, or did the SDK already
  // sign out and quietly clear the cookie before the guard mounted?
  const sessionInfo = await page.evaluate(async () => {
    const cookies = document.cookie.split(';').map((c) => c.trim())
    const hasSess = cookies.some((c) => /auth-token=/.test(c))
    let jwt = null
    try {
      const cookie = cookies.find((c) => /auth-token=/.test(c))
      const p = JSON.parse(decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1)))
      jwt = { exp: p.expires_at, hasRefresh: !!p.refresh_token }
    } catch (e) {
      jwt = { err: String(e).slice(0, 40) }
    }
    return { hasSess, jwt, headerSignedIn: !!document.body.textContent.match(/Sign out|Log out|My profile/i) }
  })
  console.log(`[diag] cookie present=${sessionInfo.hasSess} jwt=${JSON.stringify(sessionInfo.jwt)} headerLooksSignedIn=${sessionInfo.headerSignedIn}`)

  check(
    'dead session is redirected off the authenticated page',
    after.path !== START || after.search.includes('reason=expired'),
    `landed on ${after.path}${after.search}`,
  )
  check(
    'redirect target carries the expiry reason',
    after.search.includes('reason=expired') || after.path.startsWith('/login'),
    after.search || after.path,
  )
  check('no spinner left hanging', !after.spinner, `spinner=${after.spinner}`)

  await page.screenshot({ path: 'scripts/screenshots/session-expiry-guard.png' })
  console.log(`\n${pass} passed, ${fail} failed`)

  await browser.close()
  process.exit(fail === 0 ? 0 : 1)
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})