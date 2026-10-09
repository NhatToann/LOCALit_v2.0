import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'linh.tran@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })

// Read profiles.role directly via the supabase JS client used by the page
const role = await page.evaluate(async () => {
  // Use the supabase singleton if available
  try {
    const mod = await import('https://localit-nhattoann.vercel.app/_next/static/chunks/app/profile/page.js')
    return Object.keys(mod)
  } catch (e) {
    return { error: e.message }
  }
})
console.log('mod:', role)

// Direct: query REST API with the access token from cookie
const r = await page.evaluate(async () => {
  const c = document.cookie.split('; ').find(p => p.startsWith('sb-pqvnjgyqbxlylawwogjv-auth-token='))
  if (!c) return { err: 'no cookie' }
  const raw = decodeURIComponent(c.split('=')[1])
  const json = JSON.parse(atob(raw.slice(7)))
  const token = json.access_token
  const r = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/profiles?select=role,full_name&id=eq.44444444-4444-4444-4444-444444444444', {
    headers: { apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', authorization: 'Bearer ' + token }
  })
  const text = await r.text()
  return { status: r.status, body: text }
})
console.log('profile query:', JSON.stringify(r))

await browser.close()
