import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

const logs = []
p.on('console', (m) => logs.push(`[${m.type()}] ${m.text().slice(0, 400)}`))
p.on('pageerror', (e) => logs.push(`[pageerror] ${e.message.slice(0, 400)}`))

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

logs.length = 0
await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})
await p.waitForTimeout(6000)

console.log('=== every console message ===')
console.log(logs.join('\n') || '(none)')

// Force React to tell us: patch console before load and look for the
// "Minified React error" codes that hydration failures emit.
await b.close()