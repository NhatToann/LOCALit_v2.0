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
  const markers = [...document.querySelectorAll('[data-connect-state]')]
  return {
    markerCount: markers.length,
    all: markers.map((m) => ({
      state: m.getAttribute('data-connect-state'),
      myId: m.getAttribute('data-my-id'),
      dbg: m.getAttribute('data-dbg'),
    })),
    // Is there another ConnectButton elsewhere on the page that DID run?
    connectTexts: [...document.querySelectorAll('button')]
      .map((x) => (x.innerText || '').trim())
      .filter((t) => /connect|accept|decline|cancel/i.test(t)),
    // React internals: is this subtree attached to a hydrated root?
    hasReactRoot: !!document.querySelector('#__next') || !!document.querySelector('[data-reactroot]'),
    nextVersion: window.next?.version ?? null,
  }
})

console.log(JSON.stringify(r, null, 2))
await b.close()