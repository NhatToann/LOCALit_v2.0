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

const r = await p.evaluate(() => {
  const msg = [...document.querySelectorAll('a')].find((a) => (a.innerText || '').trim() === 'Message')
  const col = msg?.parentElement
  const first = col?.children[0]
  return {
    hasDataAttr: first?.hasAttribute('data-connect-state'),
    dataAttr: first?.getAttribute('data-connect-state') ?? null,
    outerHTML: first?.outerHTML?.slice(0, 260),
    // how many spinners on the whole page, and where
    allSpinners: document.querySelectorAll('.animate-spin').length,
    spinnerParents: [...document.querySelectorAll('.animate-spin')].map(
      (s) => s.parentElement?.tagName + ':' + (s.parentElement?.innerText || '').slice(0, 30),
    ),
  }
})

console.log(JSON.stringify(r, null, 2))
await b.close()