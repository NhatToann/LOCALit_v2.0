import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})

// Test getSession + getUser from the page context using the app's own env values
const r = await p.evaluate(async () => {
  const url = "https://pqvnjgyqbxlylawwogjv.supabase.co"
  const key = "sb_publishable_3uRUZqdvazd4cENt8WOWJA_SB7HmCEE"
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${key}` } })
  return { status: res.status, body: (await res.text()).slice(0,150) }
})
console.log("=== direct /auth/v1/user with anon key ===")
console.log(JSON.stringify(r, null, 2))

// Check what the auth cookie contains
const cookie = (await p.context().cookies()).find(c => c.name.includes("auth-token"))
console.log("\n=== auth cookie (first 200 chars) ===")
console.log(cookie?.value?.slice(0,200))
await b.close()
