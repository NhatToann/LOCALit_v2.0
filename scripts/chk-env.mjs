import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})
await p.waitForTimeout(5000)

const r = await p.evaluate(() => {
  const cn = 'sb-pqvnjgyqbxlylawwogjv-auth-token'
  const raw = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(cn + '='))

  // Reproduce readSessionFromCookie + readUserIdFromToken exactly
  let sessionFromCookie = null
  let err = null
  try {
    let v = decodeURIComponent(raw.slice(cn.length + 1))
    if (v.startsWith('base64-')) v = v.slice('base64-'.length)
    const b64 = v.replace(/-/g, '+').replace(/_/g, '/')
    sessionFromCookie = JSON.parse(atob(b64))
  } catch (e) { err = String(e) }

  let uid = null
  try {
    const tok = sessionFromCookie.access_token
    const pl = tok.split('.')[1]
    const b = pl.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b + '='.repeat((4 - (b.length % 4)) % 4)
    uid = JSON.parse(atob(padded)).sub
  } catch (e) { err = (err || '') + ' | jwt: ' + e }

  return {
    localStorageToken: !!localStorage.getItem('sb-pqvnjgyqbxlylawwogjv-auth-token'),
    localStorageKeys: Object.keys(localStorage),
    cookieHasToken: !!sessionFromCookie?.access_token,
    uid,
    err,
    // what does the app think NEXT_PUBLIC_SUPABASE_URL is?
    envUrl:
      typeof process !== 'undefined' && process.env
        ? process.env.NEXT_PUBLIC_SUPABASE_URL
        : 'process undefined',
  }
})

console.log(JSON.stringify(r, null, 2))
await b.close()