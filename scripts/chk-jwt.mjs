import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

const r = await p.evaluate(() => {
  const cookieName = 'sb-pqvnjgyqbxlylawwogjv-auth-token'
  const raw = document.cookie
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(cookieName + '='))

  let decoded = null
  let uid = null
  let err = null
  try {
    let v = decodeURIComponent(raw.slice(cookieName.length + 1))
    if (v.startsWith('base64-')) v = v.slice(7)
    const b64 = v.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    decoded = JSON.parse(atob(padded))
    const pl = decoded.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const claims = JSON.parse(atob(pl + '='.repeat((4 - (pl.length % 4)) % 4)))
    uid = claims.sub
  } catch (e) {
    err = String(e.message || e)
  }

  return {
    cookieFound: !!raw,
    cookieNamesVisibleToJS: document.cookie.split(';').map((s) => s.trim().split('=')[0]),
    sessionKeys: decoded ? Object.keys(decoded) : null,
    uid,
    err,
  }
})

console.log(JSON.stringify(r, null, 2))
await b.close()