import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

// count requests, group by their query signature
const reqs = []
p.on('request', (r) => {
  if (r.url().includes('/rest/v1/connections')) {
    const q = r.url().split('?')[1] || ''
    reqs.push({ t: Date.now(), sig: q.slice(0, 70) })
  }
})

await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})
await p.waitForTimeout(7000)

console.log('=== connections requests:', reqs.length, '===')
for (const r of reqs) console.log('  ', r.sig)

const state = await p.evaluate(() => {
  const el = document.querySelector('[data-connect-state]')
  return el ? el.getAttribute('data-connect-state') : 'no marker element at all'
})
console.log('\nconnect state:', state)

await b.close()