// Headless Playwright smoke for the review "You" / no-avatar fix.
// Approach:
//   1. Log in as Lan via the UI.
//   2. Ensure Lan has an accepted connection to John via direct
//      Supabase REST + service-role pg (bypassing RLS).
//   3. Visit John's buddy profile, write a review.
//   4. Assert the new review row shows Lan's real name + avatar
//      (NOT literal "You" / no avatar).
import { chromium } from 'playwright'
import { Client } from 'pg'

const PROD = 'https://localit-nhattoann.vercel.app'
const SUPA_URL = 'https://pqvnjgyqbxlylawwogjv.supabase.co'
const SUPA_ANON = 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE'

const LAN_ID = '22222222-2222-2222-2222-222222222222' // Lan Pham (buddy, top-rated seed)
const JOHN_ID = 'aaaa1111-1111-1111-1111-111111111111' // John Doe (tourist, seed)

async function step(name, fn) {
  process.stdout.write(`  ${name} ... `)
  try {
    const out = await fn()
    console.log(`PASS${out ? ' — ' + out : ''}`)
    return out
  } catch (e) {
    console.log(`FAIL — ${e.message}`)
    throw e
  }
}

// 0. Ensure Lan ↔ John accepted connection in DB.
const pg = new Client({
  connectionString: 'postgresql://postgres:that1arlecchino@db.pqvnjgyqbxlylawwogjv.supabase.co:5432/postgres',
  ssl: { rejectUnauthorized: false },
})
await pg.connect()
await pg.query(
  `INSERT INTO public.connections (requester_id, recipient_id, status, created_at, updated_at)
   VALUES ($1, $2, 'accepted', now(), now())
   ON CONFLICT DO NOTHING`,
  [LAN_ID, JOHN_ID],
)
await pg.end()

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  bypassCSP: true,
  extraHTTPHeaders: {
    // Vercel Deployment Protection bypass — otherwise the
    // canonical URL hits vercel.com/sso-api and the page shows
    // a login form (Vercel's, not ours), so we can't see the
    // password input.
    'x-vercel-protection-bypass': process.env.VERCEL_BYPASS_TOKEN || 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
    'x-vercel-set-bypass-cookie': 'samesitenone',
  },
})
const page = await ctx.newPage()
const consoleLines = []
page.on('console', (msg) => consoleLines.push(`[${msg.type()}] ${msg.text()}`))

try {
  await step('open /login', async () => {
    await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
  })

  await step('sign in as Lan', async () => {
    await page.fill('input[type="email"]', 'lan.pham@localit.dev')
    await page.fill('input[type="password"]', 'password123')
    await Promise.all([
      page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 15000 }),
      page.click('button[type="submit"]'),
    ])
    return page.url()
  })

  await step('go to John Doe profile', async () => {
    await page.goto(`${PROD}/buddies/${JOHN_ID}`, { waitUntil: 'domcontentloaded' })
  })

  await step('wait for Review section', async () => {
    await page.waitForSelector('h2#reviews-heading', { timeout: 10000 })
  })

  await step('click Write/Edit review', async () => {
    // wait for either the write button OR the gate text
    await page.waitForFunction(
      () => {
        const sec = document.querySelector('section[aria-labelledby="reviews-heading"]')
        if (!sec) return false
        return sec.querySelector('button') !== null
      },
      { timeout: 10000 },
    )
    const btn = await page.$('section[aria-labelledby="reviews-heading"] button:has-text("Write a review"), section[aria-labelledby="reviews-heading"] button:has-text("Edit your review")')
    if (!btn) throw new Error('No write-review button after gate resolved')
    await btn.click()
  })

  await step('rate 5 stars + post', async () => {
    const stars = await page.$$('input[name="rating"]')
    await stars[4].click()
    const ta = await page.$('#review-comment')
    await ta.fill('Smoke test: reviewer name + avatar should not be "You" / null.')
    await page.click('button[type="submit"]:has-text("Post review"), button[type="submit"]:has-text("Update review")')
  })

  await step('wait for review to appear in list', async () => {
    await page.waitForFunction(
      () => {
        const sec = document.querySelector('section[aria-labelledby="reviews-heading"]')
        if (!sec) return false
        const lis = sec.querySelectorAll('ul li')
        return lis.length > 0
      },
      { timeout: 8000 },
    )
  })

  await step('assert no row shows literal "You"', async () => {
    const texts = await page.$$eval(
      'section[aria-labelledby="reviews-heading"] ul li .text-sm.font-semibold',
      (els) => els.map((e) => e.textContent.trim()),
    )
    const offenders = texts.filter((t) => t === 'You')
    if (offenders.length > 0) {
      throw new Error(`Found ${offenders.length} row(s) showing literal "You": ${JSON.stringify(texts)}`)
    }
    return `names=${JSON.stringify(texts)}`
  })

  await step('assert Lan review row has avatar <img>', async () => {
    // Find the li whose name is "Lan Pham" and check the avatar has an <img>
    const found = await page.evaluate(() => {
      const sec = document.querySelector('section[aria-labelledby="reviews-heading"]')
      if (!sec) return { ok: false, why: 'no section' }
      const lis = Array.from(sec.querySelectorAll('ul li'))
      const mine = lis.find((li) => li.querySelector('.text-sm.font-semibold')?.textContent?.trim() === 'Lan Pham')
      if (!mine) return { ok: false, why: 'no Lan row' }
      const img = mine.querySelector('.avatar img')
      return { ok: !!img, src: img?.getAttribute('src') }
    })
    if (!found.ok) throw new Error(`Lan avatar check failed: ${JSON.stringify(found)}`)
    return `src=${found.src?.slice(0, 60)}…`
  })

  await page.screenshot({ path: 'scripts/screenshots/review-name-avatar.png', fullPage: true })
  console.log('\nALL CHECKS PASSED')
} catch (e) {
  console.error('\nFAILED:', e.message)
  console.error('--- last 25 console lines ---')
  for (const l of consoleLines.slice(-25)) console.error(l)
  process.exit(1)
} finally {
  await browser.close()
}
