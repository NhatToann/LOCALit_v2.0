#!/usr/bin/env node
// ============================================================================
//  Persistent LOCALit Playwright Watcher
// ----------------------------------------------------------------------------
//  Mục đích: chạy nền vô hạn, mỗi khi user thao tác trên domain *.vercel.app
//  thì tự động ghi 1 dòng JSON log chứa: timestamp, action, URL, payload,
//  network response, console line. KHÔNG tự ý click — user điều khiển.
//
//  Use case: bạn login vào Cursor browser, mở thêm 1 instance Playwright
//  này chạy headless với profile riêng (không xung đột), script lắng nghe
//  mọi navigation + DOM event + network + console + storage thay đổi.
//
//  Chạy:    node scripts/watch-localit.mjs
//  Dừng:    Ctrl+C
//  Log:     logs/watcher/<session-id>.jsonl  (mỗi action 1 dòng JSON)
//           logs/watcher/<session-id>.md     (markdown summary, real-time)
//           scripts/screenshots/watcher/      (chụp mỗi navigation)
//
//  Khác với smoke test:
//    - smoke-connect-playwright.mjs: chạy 1 lần, ~30-60s, có assertions
//    - watch-localit.mjs: chạy vô hạn, KHÔNG có assertions, chỉ ghi log
// ============================================================================

import { chromium } from 'playwright'
import { writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const PROD = 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const LAN = 'lan.pham@localit.dev'
const JOHN = 'john.doe@example.com'
const PW = 'password123'

const SESSION_ID = new Date().toISOString().replace(/[:.]/g, '-')
const LOG_DIR = 'logs/watcher'
const SCREENSHOT_DIR = 'scripts/screenshots/watcher'
const JSONL_PATH = join(LOG_DIR, `${SESSION_ID}.jsonl`)
const MD_PATH = join(LOG_DIR, `${SESSION_ID}.md`)

if (!existsSync(LOG_DIR)) mkdirSync(LOG_DIR, { recursive: true })
if (!existsSync(SCREENSHOT_DIR)) mkdirSync(SCREENSHOT_DIR, { recursive: true })

// Empty file markers
writeFileSync(JSONL_PATH, '')
writeFileSync(
  MD_PATH,
  `# LOCALit Watcher Session\n\n` +
    `- **Session ID**: \`${SESSION_ID}\`\n` +
    `- **Started**: ${new Date().toISOString()}\n` +
    `- **Mode**: persistent listener (no autonomous clicks)\n` +
    `- **Log file (raw)**: \`${JSONL_PATH}\`\n\n` +
    `---\n\n## Actions\n\n`,
)

// ============================================================================
//  JSONL writer
// ============================================================================
let seq = 0
function record(event) {
  const entry = {
    seq: ++seq,
    ts: new Date().toISOString(),
    ...event,
  }
  const line = JSON.stringify(entry) + '\n'
  appendFileSync(JSONL_PATH, line)
  // Console mirror (compact)
  const tag = `[${entry.seq.toString().padStart(5, '0')}] ${event.kind.padEnd(20)} ${event.url || ''}`
  if (event.kind === 'console.error' || event.kind === 'pageerror') {
    console.error(`  ${tag}  ${event.text || ''}`)
  } else if (event.kind === 'response' && event.status >= 400) {
    console.error(`  ${tag}  → ${event.status}`)
  } else {
    console.log(`  ${tag}`)
  }
  return entry
}

// ============================================================================
//  Markdown writer (compact, readable summary)
// ============================================================================
function appendMd(entry) {
  const t = entry.ts.replace('T', ' ').replace('Z', '')
  let line = ''
  switch (entry.kind) {
    case 'nav':
      line = `- \`${t}\` **NAV** \`${entry.url}\` (title: ${entry.title || '?'})\n`
      break
    case 'click':
      line = `- \`${t}\` **CLICK** \`${entry.selector}\` → "${entry.text?.slice(0, 60)}"\n`
      break
    case 'type':
      line = `- \`${t}\` **TYPE** \`${entry.selector}\` = "${entry.value?.slice(0, 80)}"\n`
      break
    case 'submit':
      line = `- \`${t}\` **SUBMIT** \`${entry.form}\` (action: ${entry.action || '?'})\n`
      break
    case 'response':
      if (entry.status >= 400 || entry.kind === 'response') {
        line = entry.status >= 400
          ? `- \`${t}\` ❌ **HTTP ${entry.status}** ${entry.method} \`${entry.url}\` (${entry.durationMs}ms)\n`
          : null // skip 2xx noise; jsonl has it
      }
      break
    case 'console':
      if (entry.type === 'error' || entry.type === 'warning') {
        line = `- \`${t}\` ⚠️  **${entry.type.toUpperCase()}**: ${entry.text?.slice(0, 200)}\n`
      }
      break
    case 'pageerror':
      line = `- \`${t}\` 💥 **PAGEERROR**: ${entry.message?.slice(0, 200)}\n`
      break
    case 'storage':
      line = `- \`${t}\` 💾 **STORAGE ${entry.op}** key=${entry.key} ${entry.value ? `→ ${entry.value.slice(0, 60)}` : ''}\n`
      break
    case 'screenshot':
      line = `- \`${t}\` 📸 **SHOT** \`${entry.path}\`\n`
      break
    case 'auth':
      line = `- \`${t}\` 🔐 **AUTH** ${event.event} user=${entry.userId || '?'} email=${entry.email || '?'}\n`
      break
  }
  if (line) appendFileSync(MD_PATH, line)
}

// ============================================================================
//  Helper: snapshot on every nav
// ============================================================================
async function snap(page, label) {
  const filename = `${SESSION_ID}_${String(seq).padStart(5, '0')}_${label}.png`
  const path = join(SCREENSHOT_DIR, filename)
  try {
    await page.screenshot({ path, fullPage: false })
    record({ kind: 'screenshot', path: path.replace(/\\/g, '/'), label })
  } catch (e) {
    record({ kind: 'screenshot_error', error: e.message, label })
  }
}

// ============================================================================
//  Main
// ============================================================================
async function main() {
  console.log('━'.repeat(78))
  console.log('  LOCALit Watcher — persistent listener')
  console.log(`  Session: ${SESSION_ID}`)
  console.log(`  Log:     ${JSONL_PATH}`)
  console.log(`  MD:      ${MD_PATH}`)
  console.log(`  Shots:   ${SCREENSHOT_DIR}`)
  console.log('━'.repeat(78))

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  })
  const extraHeaders = BYPASS ? { 'x-vercel-protection-bypass': BYPASS } : {}
  const ctx = await browser.newContext({
    extraHTTPHeaders: extraHeaders,
    viewport: { width: 1280, height: 800 },
    locale: 'vi-VN',
  })
  const page = await ctx.newPage()

  // ── event: console ──────────────────────────────────────────────────────
  page.on('console', (msg) => {
    const text = msg.text()
    // Skip noisy harmless ones
    if (text.includes('Download the React DevTools')) return
    const entry = record({
      kind: 'console',
      type: msg.type(),
      text,
      location: msg.location(),
    })
    appendMd(entry)
  })

  // ── event: pageerror ────────────────────────────────────────────────────
  page.on('pageerror', (err) => {
    const entry = record({ kind: 'pageerror', message: err.message, stack: err.stack })
    appendMd(entry)
  })

  // ── event: request / response ───────────────────────────────────────────
  const reqStart = new Map()
  page.on('request', (req) => {
    reqStart.set(req, Date.now())
  })
  page.on('response', async (res) => {
    const req = res.request()
    const start = reqStart.get(req) || Date.now()
    const durationMs = Date.now() - start
    const url = res.url()
    // Only log interesting domains
    if (
      !url.includes('localit') &&
      !url.includes('supabase') &&
      !url.includes('vercel') &&
      !url.includes('livekit') &&
      !url.includes('resend')
    ) {
      return
    }
    const entry = record({
      kind: 'response',
      method: req.method(),
      url,
      status: res.status(),
      durationMs,
      resourceType: req.resourceType(),
    })
    appendMd(entry)
  })

  // ── event: navigation ──────────────────────────────────────────────────
  page.on('framenavigated', async (frame) => {
    if (frame !== page.mainFrame()) return
    const url = frame.url()
    const title = await page.title().catch(() => '?')
    const entry = record({ kind: 'nav', url, title })
    appendMd(entry)
    // Auto-snap on every nav (max 1 per 500ms to avoid storm)
    if (!page._lastSnap || Date.now() - page._lastSnap > 500) {
      page._lastSnap = Date.now()
      await snap(page, 'nav').catch(() => {})
    }
  })

  // ── event: DOM mutations on clickable elements ─────────────────────────
  // Listen via exposed hook in page context
  await page.exposeFunction('__watcherRecord', (payload) => {
    const entry = record(payload)
    appendMd(entry)
  })
  await page.addInitScript(() => {
    // Click capture
    document.addEventListener(
      'click',
      (e) => {
        const t = e.target
        const sel = t.id
          ? `#${t.id}`
          : t.tagName.toLowerCase() +
            (t.className && typeof t.className === 'string'
              ? '.' + t.className.trim().split(/\s+/).slice(0, 3).join('.')
              : '') +
            (t.getAttribute('role') ? `[role=${t.getAttribute('role')}]` : '')
        window.__watcherRecord({
          kind: 'click',
          selector: sel.slice(0, 200),
          text: (t.textContent || '').trim().slice(0, 200),
          tag: t.tagName,
          href: t.closest('a')?.href || null,
        })
      },
      true, // capture phase so we get it before app handlers
    )
    // Input/type capture
    document.addEventListener(
      'input',
      (e) => {
        const t = e.target
        if (!t.name && !t.id) return
        window.__watcherRecord({
          kind: 'type',
          selector: t.id ? `#${t.id}` : `[name=${t.name}]`,
          inputType: t.type,
          value: t.value,
        })
      },
      true,
    )
    // Form submit
    document.addEventListener(
      'submit',
      (e) => {
        const f = e.target
        window.__watcherRecord({
          kind: 'submit',
          form: f.id || f.className || f.tagName,
          action: f.action,
          method: f.method,
        })
      },
      true,
    )
    // localStorage write
    const origSetItem = Storage.prototype.setItem
    Storage.prototype.setItem = function (k, v) {
      window.__watcherRecord({ kind: 'storage', op: 'set', key: k, value: String(v) })
      return origSetItem.call(this, k, v)
    }
    const origRemoveItem = Storage.prototype.removeItem
    Storage.prototype.removeItem = function (k) {
      window.__watcherRecord({ kind: 'storage', op: 'del', key: k })
      return origRemoveItem.call(this, k)
    }
  })

  // ── Supabase auth state change ─────────────────────────────────────────
  // Subscribe to the auth storage key in the same context, log changes
  await page.addInitScript(() => {
    let lastAuthJson = null
    setInterval(() => {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith('sb-') && k.endsWith('-auth-token')) {
          const v = localStorage.getItem(k)
          if (v && v !== lastAuthJson) {
            lastAuthJson = v
            try {
              const parsed = JSON.parse(v)
              const user = parsed?.user
              if (user) {
                window.__watcherRecord({
                  kind: 'auth',
                  event: 'token-changed',
                  userId: user.id,
                  email: user.email,
                  expiresAt: parsed.expires_at,
                })
              }
            } catch {}
          }
        }
      }
    }, 1000)
  })

  // ── Boot: navigate to prod, then auto-signin Lan ───────────────────────
  console.log('\n▸ navigating to /login…')
  await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {})

  console.log('▸ signing in as Lan (lan.pham@localit.dev)…')
  try {
    await page.locator('input[type="email"]').fill(LAN, { timeout: 10_000 })
    await page.locator('input[type="password"]').fill(PW, { timeout: 5_000 })
    await Promise.all([
      page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30_000 }),
      page.locator('button[type="submit"]').click(),
    ])
    record({ kind: 'auth', event: 'signed-in', email: LAN })
    console.log('✓ signed in as Lan')
  } catch (e) {
    record({ kind: 'auth', event: 'signin-failed', email: LAN, error: e.message })
    console.error('✗ signin failed:', e.message)
  }

  console.log('\n▸ LISTENING. Ctrl+C to stop.\n')

  // Keep alive
  await new Promise(() => {})
}

main().catch((e) => {
  console.error('FATAL', e)
  process.exit(1)
})

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\n▸ Stopping watcher (SIGINT)…')
  console.log(`▸ Log: ${JSONL_PATH}`)
  console.log(`▸ MD:  ${MD_PATH}`)
  process.exit(0)
})
process.on('SIGTERM', () => process.exit(0))
