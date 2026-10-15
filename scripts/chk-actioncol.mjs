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

// Locate the column that CONTAINS the Message link — that is the action column.
const info = await p.evaluate(() => {
  const msg = [...document.querySelectorAll('a')].find((a) => (a.innerText || '').trim() === 'Message')
  if (!msg) return { found: false }
  const col = msg.parentElement
  return {
    found: true,
    colHTML: col.innerHTML.slice(0, 700),
    colChildren: [...col.children].map((c) => `${c.tagName}: ${(c.innerText || c.className).slice(0, 50)}`),
  }
})

console.log(JSON.stringify(info, null, 2))

console.log('\n=== visible text of the action column ===')
const msg = p.locator('a', { hasText: 'Message' }).first()
const col = msg.locator('xpath=..')
console.log(await col.innerText())

console.log('\n=== buttons inside the action column ===')
const btns = await col.locator('button, a').allInnerTexts()
console.log(btns.filter((t) => t.trim()).join(' | '))

await b.close()