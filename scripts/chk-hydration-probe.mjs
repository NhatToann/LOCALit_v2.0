import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

const errs = []
p.on('pageerror', (e) => errs.push('pageerror: ' + e.message))
p.on('console', (m) => {
  const t = m.text()
  if (m.type() === 'error' || /hydrat|Minified React error/i.test(t)) errs.push(`${m.type()}: ${t}`)
})

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

errs.length = 0
await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})
await p.waitForTimeout(7000)

console.log('=== errors / hydration warnings ===')
console.log(errs.join('\n') || '(none)')

// Is the page interactive at all? Click something harmless and see.
const clickable = await p.evaluate(() => {
  const el = document.querySelector('a[href="/browse"]')
  if (!el) return 'no link'
  let fired = false
  const h = () => { fired = true }
  el.addEventListener('click', h)
  el.click()
  setTimeout(() => el.removeEventListener('click', h), 0)
  return fired ? 'react handler attached' : 'no react handler (not hydrated)'
})
console.log('\n=== hydration probe ===')
console.log(clickable)

await b.close()