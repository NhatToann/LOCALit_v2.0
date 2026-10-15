import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

// Spy on Supabase's getSession to see whether ConnectButton reaches it.
await p.addInitScript(() => {
  window.__getSessionCalls = 0
  window.__connQueries = 0
})

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

const reqs = []
p.on('request', (r) => {
  const u = r.url()
  if (u.includes('/rest/v1/connections')) reqs.push(u.split('rest/v1')[1].slice(0, 60))
  if (u.includes('/auth/v1/token')) reqs.push('TOKEN_REFRESH ' + u.split('/auth/v1')[1])
})

await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'domcontentloaded',
})

for (const t of [1000, 3000, 6000]) {
  await p.waitForTimeout(t === 1000 ? 1000 : 2000)
  const s = await p.evaluate(() => {
    const msg = [...document.querySelectorAll('a')].find((a) => (a.innerText || '').trim() === 'Message')
    const col = msg?.parentElement
    return {
      firstChild: col?.children[0]?.tagName,
      firstChildText: (col?.children[0]?.innerText || '').trim(),
      hasSpinner: !!col?.children[0]?.querySelector('.animate-spin'),
    }
  })
  console.log(`@${t}ms`, JSON.stringify(s))
}

console.log('\n=== network ===')
console.log(reqs.join('\n') || '(none)')

await b.close()