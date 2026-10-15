import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

const scripts = []
p.on('response', async (r) => {
  if (r.url().includes('/_next/static/') && r.url().endsWith('.js')) {
    scripts.push(r.url())
  }
})

await p.goto('https://localit-vn.vercel.app/login?switch=1', { waitUntil: 'domcontentloaded' })
await p.fill('input[type="email"]', 'lan.pham@localit.dev')
await p.fill('input[type="password"]', 'password123')
await p.click('button[type="submit"]')
await p.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

scripts.length = 0
await p.goto('https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222', {
  waitUntil: 'networkidle',
})
await p.waitForTimeout(4000)

console.log('=== js chunks loaded:', scripts.length, '===')

let marker = false
for (const u of scripts) {
  try {
    const body = await (await fetch(u)).text()
    if (body.includes('Request pending') || body.includes('Sign in to connect')) {
      console.log('  ConnectButton chunk:', u.split('/').pop())
      marker = true
    }
    // The new code decodes the JWT; look for the telltale padding math
    if (body.includes('4 - ') && body.includes('replace(/-/g')) {
      console.log('  contains JWT decode helper:', u.split('/').pop())
    }
  } catch {}
}
console.log('ConnectButton code present:', marker)

console.log('\n=== spinner check ===')
console.log('animate-spin in action column:', await p.locator('div.flex.flex-col.gap-2 .animate-spin').count())
console.log('action column buttons:', (await p.locator('div.flex.flex-col.gap-2 > *').allInnerTexts()).join(' | '))

await b.close()