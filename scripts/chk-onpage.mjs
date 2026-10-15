import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

// Now measure ON THE TARGET PAGE, not on /login
const connReqs = []
p.on('request', (r) => {
  if (r.url().includes('/rest/v1/connections')) connReqs.push(r.url().split('rest/v1')[1].slice(0, 90))
})

await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})

// Poll the cookie decode over time to see if it ever becomes available
for (const wait of [500, 1500, 3000, 6000]) {
  await p.waitForTimeout(wait === 500 ? 500 : wait - 500)
  const snap = await p.evaluate(() => {
    const cn = 'sb-pqvnjgyqbxlylawwogjv-auth-token'
    const raw = document.cookie.split(';').map((s) => s.trim()).find((s) => s.startsWith(cn + '='))
    let uid = null
    try {
      let v = decodeURIComponent(raw.slice(cn.length + 1))
      if (v.startsWith('base64-')) v = v.slice(7)
      const b64 = v.replace(/-/g, '+').replace(/_/g, '/')
      const s = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)))
      const pl = s.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
      uid = JSON.parse(atob(pl + '='.repeat((4 - (pl.length % 4)) % 4))).sub
    } catch {}
    return {
      uid,
      cookieVisible: document.cookie.includes('auth-token'),
      spinner: document.querySelectorAll('div.flex.flex-col.gap-2 .animate-spin').length,
      colText: (document.querySelector('div.flex.flex-col.gap-2')?.innerText || '').slice(0, 80),
    }
  })
  console.log(`@${wait}ms`, JSON.stringify(snap))
}

console.log('\n=== connections requests ===')
console.log(connReqs.join('\n') || '(NONE)')

await b.close()