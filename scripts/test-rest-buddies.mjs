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

// Query directly from client
const r = await page.evaluate(async () => {
  const c = document.cookie.split('; ').find(p => p.startsWith('sb-pqvnjgyqbxlylawwogjv-auth-token='))
  const raw = decodeURIComponent(c.split('=')[1])
  const json = JSON.parse(atob(raw.slice(7)))
  const r = await fetch('https://pqvnjgyqbxlylawwogjv.supabase.co/rest/v1/safe_buddies?select=bio,profile:safe_profiles(full_name,bio)&id=eq.11111111-1111-1111-1111-111111111111', {
    headers: { apikey: 'sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE', authorization: 'Bearer ' + json.access_token }
  })
  return { status: r.status, body: await r.text() }
})
console.log('query result:', JSON.stringify(r, null, 2))

await browser.close()
