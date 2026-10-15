import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

// Count getUser calls from the whole page, and separately note whether the
// reviews query fired (ReviewSection ran its effect).
const events = []
p.on('request', (r) => {
  const u = r.url()
  if (u.includes('/rest/v1/reviews')) events.push('REVIEWS ' + u.split('?')[1]?.slice(0, 40))
  if (u.includes('/rest/v1/connections')) events.push('CONNECTIONS ' + u.split('?')[1]?.slice(0, 40))
  if (u.includes('/auth/v1/user')) events.push('GETUSER')
})

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

events.length = 0
await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})
await p.waitForTimeout(7000)

const counts = {}
events.forEach((e) => {
  const k = e.split(' ')[0]
  counts[k] = (counts[k] || 0) + 1
})
console.log('=== event counts ===')
console.log(counts)

const ui = await p.evaluate(() => {
  const m = document.querySelector('[data-connect-state]')
  return {
    connectState: m?.getAttribute('data-connect-state'),
    connectDbg: m?.getAttribute('data-dbg'),
    reviewsLoading: document.body.innerText.includes('Loading reviews'),
    // Text that only appears after a successful reviews fetch
    reviewsEmpty: /No reviews|Be the first|Reviews\b/.test(document.body.innerText),
  }
})
console.log('\n=== ui ===')
console.log(JSON.stringify(ui, null, 2))

await b.close()