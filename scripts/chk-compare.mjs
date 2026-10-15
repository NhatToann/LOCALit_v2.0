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
await p.waitForTimeout(6000)

// Compare against a page we KNOW hydrates client components.
const a = await p.evaluate(() => {
  const m = document.querySelector('[data-connect-state]')
  return { marker: m?.getAttribute('data-dbg') ?? 'none' }
})
console.log('buddies page  connect dbg:', a.marker)

await p.goto('https://localit-vn.vercel.app/dashboard', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(4000)
const dash = await p.evaluate(() => ({
  notificationsFetched: !!document.querySelector('header'),
  spinnerCount: document.querySelectorAll('.animate-spin').length,
}))
console.log('dashboard spinners:', dash.spinnerCount)

await p.goto('https://localit-vn.vercel.app/browse', { waitUntil: 'domcontentloaded' })
await p.waitForTimeout(4000)
const browse = await p.evaluate(() => ({
  spinnerCount: document.querySelectorAll('.animate-spin').length,
  text: document.body.innerText.slice(0, 120),
}))
console.log('browse spinners:', browse.spinnerCount)
console.log('browse text:', browse.text.replace(/\n/g, ' '))

await b.close()