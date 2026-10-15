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
await p.waitForTimeout(4000)

const r = await p.evaluate(() => {
  const cookies = document.cookie.split(';').map((s) => s.trim())
  const cn = 'sb-pqvnjgyqbxlylawwogjv-auth-token'

  // exact replication of readSessionFromCookie()
  const raw = cookies.find((s) => s.startsWith(cn + '='))
  const steps = { cookieNames: cookies.map((c) => c.split('=')[0]), rawFound: !!raw }

  try {
    let v = decodeURIComponent(raw.slice(cn.length + 1))
    steps.startsWithBase64 = v.startsWith('base64-')
    if (v.startsWith('base64-')) v = v.slice('base64-'.length)
    const b64 = v.replace(/-/g, '+').replace(/_/g, '/')
    const s = JSON.parse(atob(b64))
    steps.sessionParsed = !!s
    steps.hasAccessToken = !!s.access_token

    const pl = s.access_token.split('.')[1]
    const bb = pl.replace(/-/g, '+').replace(/_/g, '/')
    const padded = bb + '='.repeat((4 - (bb.length % 4)) % 4)
    const claims = JSON.parse(atob(padded))
    steps.sub = claims.sub
    steps.claimKeys = Object.keys(claims).slice(0, 6)
  } catch (e) {
    steps.error = String(e)
  }
  return steps
})

console.log(JSON.stringify(r, null, 2))
await b.close()