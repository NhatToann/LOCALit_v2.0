// scripts/domain-watcher.mjs
//
// Long-running domain activity watcher for localit-nhattoann.vercel.app.
//
// What it does:
//   1. Signs in once as the seed buddy (lan.pham@localit.dev).
//   2. Opens /dashboard in a single headless Chromium tab.
//   3. Stays open INDEFINITELY, tailing:
//        - console.log / info / warn / error
//        - page errors (uncaught exceptions, runtime errors)
//        - every HTTP request + response (status, method, url, type)
//        - every navigation (pushState / replaceState / page.goto)
//        - every DOM mutation: click, input, scroll (debounced)
//   4. Writes a JSONL log (one JSON object per line) to $env:TEMP\domain-watcher.log
//      with `{ ts, type, ... }` shape so it's greppable + parseable.
//
// Usage:
//   node scripts/domain-watcher.mjs
//   # or to log to a custom file:
//   $env:WATCHER_LOG = "D:\logs\watcher.jsonl"; node scripts/domain-watcher.mjs
//
// Stop with Ctrl+C. Never exits on its own.
//
// This is a SESSION-LONG monitor. It is NOT a smoke test. There is no
// pass/fail, no timeout, no auto-cleanup. Tail the log file with:
//   Get-Content "$env:TEMP\domain-watcher.log" -Wait
// (and Ctrl+C in BOTH windows to stop both the watcher AND the tail).

import { chromium } from 'playwright'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? ''
const EMAIL = 'lan.pham@localit.dev'
const PASSWORD = 'password123'

// --- log file setup ---------------------------------------------------------

const LOG_PATH = process.env.WATCHER_LOG
  || `${process.env.TEMP || '/tmp'}/domain-watcher.log`

import { appendFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
try {
  mkdirSync(dirname(LOG_PATH), { recursive: true })
} catch {}

function writeEvent(type, fields = {}) {
  const evt = { ts: new Date().toISOString(), type, ...fields }
  let line
  try {
    line = JSON.stringify(evt)
  } catch (e) {
    line = JSON.stringify({ ts: evt.ts, type: 'log_serialize_error', err: String(e) })
  }
  try {
    appendFileSync(LOG_PATH, line + '\n')
  } catch (e) {
    // Last-ditch: stderr
    process.stderr.write(`[watcher] cannot write log: ${e}\n`)
  }
  // Also echo a one-line summary to stdout so a foreground `node watcher.mjs`
  // operator sees the activity live.
  const summary = summarize(evt)
  if (summary) process.stdout.write(`[${evt.ts}] ${summary}\n`)
}

function summarize(evt) {
  switch (evt.type) {
    case 'signin_ok':
      return `signed in as ${evt.email}`
    case 'signin_fail':
      return `SIGNIN FAILED: ${evt.err}`
    case 'console':
      return `console.${evt.level} ${truncate(evt.text, 200)}`
    case 'pageerror':
      return `PAGE ERROR: ${truncate(evt.message, 200)}`
    case 'request':
      return `→ ${evt.method} ${evt.url}`
    case 'response':
      return `← ${evt.status} ${evt.url} (${evt.durationMs}ms)`
    case 'nav':
      return `NAV ${evt.from || '(none)'} → ${evt.to}`
    case 'click':
      return `CLICK ${evt.selector} on ${evt.url}`
    case 'input':
      return `INPUT ${evt.selector} on ${evt.url}`
    case 'scroll':
      return `SCROLL y=${evt.y} on ${evt.url}`
    case 'mutation':
      return `MUTATION ${evt.kind} x${evt.count} on ${evt.url}`
    case 'ready':
      return `READY — watching ${evt.url} (log: ${LOG_PATH})`
    case 'shutdown':
      return `SHUTDOWN — ${evt.reason}`
    default:
      return null
  }
}

function truncate(s, n) {
  s = String(s ?? '')
  return s.length > n ? s.slice(0, n) + '…' : s
}

// --- main -------------------------------------------------------------------

async function main() {
  process.on('SIGINT', () => {
    writeEvent('shutdown', { reason: 'SIGINT' })
    setTimeout(() => process.exit(0), 200)
  })
  process.on('SIGTERM', () => {
    writeEvent('shutdown', { reason: 'SIGTERM' })
    setTimeout(() => process.exit(0), 200)
  })

  writeEvent('boot', {
    node: process.version,
    pid: process.pid,
    log: LOG_PATH,
    prod: PROD,
  })

  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    extraHTTPHeaders: BYPASS
      ? {
          'x-vercel-protection-bypass': BYPASS,
          // Set a persistent bypass cookie on the same origin so cross-origin
          // redirects (302 → vercel.com/sso-api) can still validate.
          'x-vercel-set-bypass-cookie': 'samesitenone',
        }
      : {},
    viewport: { width: 1280, height: 800 },
    userAgent:
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LOCALitWatcher/1.0 ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  })

  // Intercept Vercel Deployment-Protection redirects on our own origin. The
  // server replies 302 → /sso-api for un-bypassed requests, which drops the
  // bypass header on the cross-origin follow-up. Detect that 302 and
  // rewrite the Location to the same URL + bypass query, so the browser
  // stays on our origin and Vercel admits the request.
  await ctx.route('**/*', async (route) => {
    if (!BYPASS) return route.continue()
    const req = route.request()
    const url = req.url()
    // Only intercept our origin's protection gate.
    if (!url.startsWith(PROD)) return route.continue()
    // Forward the request, then check the response.
    const resp = await route.fetch({ maxRedirects: 0 }).catch((e) => {
      writeEvent('route_err', { url, err: String(e) })
      return null
    })
    if (!resp) return route.continue()
    const status = resp.status()
    if (status === 302 || status === 307) {
      const loc = resp.headers()['location'] || ''
      // If Vercel is bouncing us to its SSO gate, rewrite the redirect to
      // stay on our origin with the bypass as a query param. Vercel's
      // bypass logic also accepts it as a query param.
      if (loc.includes('vercel.com/sso-api') || loc.includes('vercel.com/login')) {
        const u = new URL(url)
        u.searchParams.set('x-vercel-protection-bypass', BYPASS)
        writeEvent('route_rewrite', { from: loc, to: u.toString() })
        // Fulfill the original request with a 200 to a same-origin page is
        // not what we want — we want the browser to follow to /dashboard.
        // Instead, issue a 200 to the protected URL with the bypass query
        // attached and let the page itself load. (Vercel serves the
        // protected content when the bypass query matches.)
        return route.fulfill({
          status: 200,
          headers: { ...resp.headers(), location: u.toString() },
          body: '',
        })
      }
    }
    return route.fulfill({ response: resp })
  })
  const page = await ctx.newPage()

  // --- console ---
  page.on('console', (msg) => {
    const t = msg.type()
    if (t === 'verbose' || t === 'debug') return // skip noise
    writeEvent('console', {
      level: t,
      text: msg.text(),
      location: msg.location(),
      url: page.url(),
    })
  })

  // --- page error ---
  page.on('pageerror', (err) => {
    writeEvent('pageerror', {
      message: err.message,
      stack: err.stack,
      url: page.url(),
    })
  })

  // --- request ---
  const inflight = new Map() // url -> startedAt
  page.on('request', (req) => {
    inflight.set(req, Date.now())
    writeEvent('request', {
      method: req.method(),
      url: req.url(),
      resourceType: req.resourceType(),
    })
  })

  // --- response ---
  page.on('response', async (res) => {
    const started = inflight.get(res.request())
    inflight.delete(res.request())
    writeEvent('response', {
      status: res.status(),
      method: res.request().method(),
      url: res.url(),
      durationMs: started ? Date.now() - started : null,
    })
  })

  // --- request failure ---
  page.on('requestfailed', (req) => {
    inflight.delete(req)
    writeEvent('requestfailed', {
      method: req.method(),
      url: req.url(),
      failure: req.failure()?.errorText,
    })
  })

  // --- navigation ---
  let lastUrl = null
  page.on('framenavigated', (frame) => {
    if (frame !== page.mainFrame()) return
    const to = frame.url()
    const from = lastUrl
    lastUrl = to
    writeEvent('nav', { from, to })
  })

  // --- DOM mutations (click/input/scroll + generic) ---
  // We use a single MutationObserver on document.documentElement so we
  // don't have to attach thousands of listeners.
  await page.addInitScript(() => {
    // Mark clickable elements with a stable selector so the MutationObserver
    // can attribute mutations back to a CSS path. We only tag on the first
    // click — so we never mutate the DOM unless the user actually clicks.
    const orig = EventTarget.prototype.addEventListener
    window.__watcher_installed = true
  })
  await page.exposeFunction('__watcherClick', (selector, url) => {
    writeEvent('click', { selector, url })
  })
  await page.exposeFunction('__watcherInput', (selector, value, url) => {
    // Don't log every keystroke for password fields.
    if (/type=["']password["']/i.test(selector)) {
      writeEvent('input', { selector, url, value: '***' })
    } else {
      writeEvent('input', { selector, value: String(value).slice(0, 200), url })
    }
  })
  await page.exposeFunction('__watcherScroll', (y, url) => {
    writeEvent('scroll', { y, url })
  })
  await page.exposeFunction('__watcherMutation', (kind, count, url) => {
    writeEvent('mutation', { kind, count, url })
  })

  // --- sign in ---
  // Vercel Deployment Protection: when the request comes with the
  // `x-vercel-protection-bypass` header AND `x-vercel-set-bypass-cookie:
  // samesitenone`, Vercel sets `_vercel_jwt` cookie on the response and
  // grants access. Subsequent navigations (including cross-origin
  // redirects) ride on the cookie. Header is attached via
  // `extraHTTPHeaders` on the context above.
  try {
    await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded', timeout: 30_000 })
    await page.locator('input[type="email"]').waitFor({ state: 'visible', timeout: 30_000 })
    await page.fill('input[type="email"]', EMAIL)
    await page.fill('input[type="password"]', PASSWORD)
    await Promise.all([
      page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 }),
      page.click('button[type="submit"]'),
    ])
    writeEvent('signin_ok', { email: EMAIL, url: page.url() })
  } catch (e) {
    writeEvent('signin_fail', { err: String(e) })
    await browser.close()
    return
  }

  // Navigate to /dashboard (the page most likely to surface any client errors)
  await page.goto(`${PROD}/dashboard`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await page.waitForTimeout(2000)
  writeEvent('ready', { url: page.url() })

  // --- install click/input/scroll + MutationObserver AFTER the page is up ---
  await page.evaluate(() => {
    function sel(el) {
      if (!el) return 'null'
      if (el === document.body) return 'body'
      const id = el.id ? `#${el.id}` : ''
      const cls = el.className && typeof el.className === 'string'
        ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.')
        : ''
      const tag = el.tagName ? el.tagName.toLowerCase() : 'el'
      return `${tag}${id}${cls}`
    }

    document.addEventListener(
      'click',
      (e) => {
        const s = sel(e.target)
        window.__watcherClick(s, location.href)
      },
      true,
    )

    let lastInput = 0
    document.addEventListener(
      'input',
      (e) => {
        const now = Date.now()
        if (now - lastInput < 100) return // debounce
        lastInput = now
        const el = e.target
        window.__watcherInput(sel(el), el.value, location.href)
      },
      true,
    )

    let lastScroll = 0
    window.addEventListener(
      'scroll',
      () => {
        const now = Date.now()
        if (now - lastScroll < 250) return
        lastScroll = now
        window.__watcherScroll(Math.round(window.scrollY), location.href)
      },
      { passive: true },
    )

    // Generic DOM mutation counter — debounced — to catch things like
    // modals popping in, list items being added, etc.
    let pending = 0
    let flushTimer = null
    const obs = new MutationObserver(() => {
      pending++
      if (flushTimer) return
      flushTimer = setTimeout(() => {
        const n = pending
        pending = 0
        flushTimer = null
        window.__watcherMutation('dom', n, location.href)
      }, 500)
    })
    obs.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeOldValue: false,
    })
  })

  // --- keep the script alive forever ---
  // Every 5 minutes, write a heartbeat so a tail consumer knows we're alive
  // and didn't crash silently.
  setInterval(() => {
    writeEvent('heartbeat', { url: page.url(), uptimeSec: Math.round(process.uptime()) })
  }, 5 * 60 * 1000).unref()

  // Block forever (until SIGINT/SIGTERM)
  await new Promise(() => {})
}

main().catch((e) => {
  writeEvent('fatal', { err: String(e), stack: e?.stack })
  setTimeout(() => process.exit(1), 500)
})
