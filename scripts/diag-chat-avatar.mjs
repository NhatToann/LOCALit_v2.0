// Diagnostic: does the /chat page render OUR avatar on our own messages?
// Login as Lan, open /chat, inspect every .avatar inside the message list.
import { chromium } from 'playwright'

const BASE = process.env.BASE_URL || 'https://localit-nhattoann.vercel.app'
// Vercel Deployment Protection intercepts non-CLI requests with a 302 to
// vercel.com/login, which is NOT the LOCALit login page — the form has one
// input and no password field. This cookie is the same bypass token the
// other scripts/ in this repo already use.
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

  const errors = []
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  // Dump the real form markup so selector guesses stop costing 30s each.
  const inputs = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map((i) => ({
      type: i.type,
      name: i.name,
      id: i.id,
      ph: i.placeholder,
    })),
  )
  console.log(`[info] url=${page.url()}`)
  console.log(`[info] inputs: ${JSON.stringify(inputs)}`)

  if (!inputs.some((i) => i.type === 'password')) {
    console.log('FAIL: no password field — not on the login page')
    await browser.close()
    process.exit(1)
  }

  await page.fill('input[type=email]', 'lan.pham@localit.dev')
  await page.fill('input[type=password]', 'password123')
  await page.click('button[type=submit]')
  await page.waitForTimeout(6000)
  console.log(`[info] post-login url: ${page.url()}`)

  // Capture the session token + user id straight from Supabase storage.
  // The session cookie is httpOnly, so document.cookie in the page context
  // can see the NAME but never the value. Read it through the browser
  // context instead, which is not subject to the same restriction.
  const cookies = await ctx.cookies(BASE)
  const tokenCookie = cookies.find((c) => /auth-token$/.test(c.name))
  const auth = (() => {
    if (!tokenCookie) return null
    const raw = decodeURIComponent(tokenCookie.value)
    // The value is either a bare JSON blob or base64("base64-", JSON)
    // depending on the @supabase/ssr version and cookie encoding.
    const candidates = [raw]
    const b64 = raw.replace(/^base64-/, '')
    if (b64 !== raw) candidates.push(Buffer.from(b64, 'base64').toString('utf8'))
    try {
      candidates.push(Buffer.from(raw, 'base64').toString('utf8'))
    } catch {}
    for (const cand of candidates) {
      try {
        const p = JSON.parse(cand)
        if (p.access_token) return { token: p.access_token, user: p.user }
      } catch {}
    }
    return null
  })()
  if (!auth) {
    console.log('FAIL: could not decode a session token from the auth cookie')
    console.log(`  cookie len=${tokenCookie?.value?.length ?? 0} prefix=${String(tokenCookie?.value).slice(0, 24)}`)
    await browser.close()
    process.exit(1)
  }
  console.log(`[info] signed in as ${auth.user?.email} (${auth.user?.id})`)

  // Now probe the exact query /chat runs for its own avatar.
  const probe = await page.evaluate(async ({ token, url }) => {
    const SB = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
    const KEY = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'
    const h = { apikey: KEY, authorization: `Bearer ${token}` }
    const res = await fetch(
      `${SB}/rest/v1/profiles?select=id,full_name,avatar_url&limit=3`,
      { headers: h },
    )
    return { status: res.status, body: (await res.text()).slice(0, 400) }
  }, { token: auth.token, url: BASE })
  console.log(`[probe] GET /rest/v1/profiles -> ${probe.status}`)
  console.log(`[probe] body: ${probe.body}`)

  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(6000)

  // The sidebar list and the message thread both use .avatar, and they
  // have DIFFERENT sizes (40px sidebar vs 32px bubble). Filter to the
  // thread container so the counts below describe messages only.
  await page.evaluate(() => {
    const first = document.querySelector('main button, [role=main] button')
    const conv = [...document.querySelectorAll('button')].find(
      (b) => /Start chatting|:\s*$/.test(b.textContent || '') || b.querySelector('.avatar'),
    )
    ;(conv || first)?.click()
  })
  await page.waitForTimeout(4000)

  const avatars = await page.evaluate(() => {
    const out = []
    for (const a of document.querySelectorAll('.avatar')) {
      const img = a.querySelector('img')
      const r = a.getBoundingClientRect()
      // Only count avatars that live inside a message <li>.
      const li = a.closest('li')
      out.push({
        inThread: !!li,
        hasImg: !!img,
        src: img ? img.src : null,
        text: a.textContent.trim().slice(0, 12),
        size: `${Math.round(r.width)}x${Math.round(r.height)}`,
        radius: getComputedStyle(a).borderRadius,
        parentText: (li?.textContent || a.closest('button')?.textContent || '').trim().slice(0, 40),
      })
    }
    return out
  })

  const thread = avatars.filter((a) => a.inThread)
  console.log(`\n[chat] total .avatar = ${avatars.length}, inside message thread = ${thread.length}`)
  console.log(`[chat] sidebar avatars = ${avatars.length - thread.length}`)
  console.log(`\n[thread] every avatar (size / radius / hasImg / src-tail):`)
  for (const a of thread) {
    console.log(
      `  ${a.size} r=${a.radius} img=${a.hasImg ? 'Y' : 'N'} ${
        a.src ? a.src.slice(-42) : `initials:${a.text}`
      } :: ${a.parentText}`,
    )
  }
  const noImg = thread.filter((a) => !a.hasImg || !a.src)
  console.log(
    `\n[thread] with image: ${thread.length - noImg.length} / ${thread.length}`,
  )
  if (noImg.length) {
    console.log('[thread] MISSING IMAGE:')
    for (const a of noImg) console.log(`  - "${a.text}" ${a.size} r=${a.radius} :: ${a.parentText}`)
  }

  if (errors.length) {
    console.log(`\n[console errors] ${errors.length}`)
    for (const e of errors.slice(0, 5)) console.log(`  ! ${e.slice(0, 140)}`)
  }

  await page.screenshot({ path: 'scripts/screenshots/diag-chat-avatar.png', fullPage: false })
  console.log('\nscreenshot -> scripts/screenshots/diag-chat-avatar.png')

  await browser.close()
}

run().catch((e) => {
  console.error('ERR', e.message)
  process.exit(1)
})