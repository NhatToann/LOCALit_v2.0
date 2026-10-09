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

// Get user ID from cookie
const info = await page.evaluate(() => {
  const c = document.cookie.split('; ').find(p => p.startsWith('sb-pqvnjgyqbxlylawwogjv-auth-token='))
  if (!c) return null
  const raw = decodeURIComponent(c.split('=')[1])
  const json = JSON.parse(atob(raw.slice(7)))
  const token = json.access_token
  // Decode JWT
  const parts = token.split('.')
  const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
  return {
    cookie_user_id: json.user.id,
    jwt_sub: payload.sub,
    jwt_email: payload.email,
  }
})
console.log('session info:', JSON.stringify(info, null, 2))

// Then fetch profile for that user
const r = await page.evaluate(async (uid) => {
  const c = document.cookie.split('; ').find(p => p.startsWith('sb-pqvnjgyqbxlylawwogjv-auth-token='))
  const raw = decodeURIComponent(c.split('=')[1])
  const json = JSON.parse(atob(raw.slice(7)))
  const r = await fetch(`https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/profiles?select=role,full_name,id&id=eq.${uid}`, {
    headers: { apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', authorization: 'Bearer ' + json.access_token }
  })
  return { status: r.status, body: await r.text() }
}, info.cookie_user_id)
console.log('query for cookie user:', JSON.stringify(r, null, 2))

await browser.close()
