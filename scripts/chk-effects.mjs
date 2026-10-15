import { chromium } from 'playwright'

const b = await chromium.launch()
const p = await (await b.newContext()).newPage()

// Instrument BEFORE any app code runs.
await p.addInitScript(() => {
  window.__reactEffects = []
  const orig = window.requestAnimationFrame
  window.__rafCount = 0
  const origRaf = orig
  window.requestAnimationFrame = function (cb) {
    window.__rafCount++
    return origRaf.call(window, cb)
  }
})

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
  const m = document.querySelector('[data-connect-state]')
  return {
    marker: m
      ? {
          state: m.getAttribute('data-connect-state'),
          dbg: m.getAttribute('data-dbg'),
        }
      : null,
    rafCount: window.__rafCount,
    // Proof of life: does ANY client-side state update work on this page?
    // ReviewSection also runs an effect; check whether it resolved.
    reviewsStillLoading: !!document.body.innerText.includes('Loading reviews'),
  }
})

console.log(JSON.stringify(r, null, 2))

// Does a manual reload (full SSR, then hydrate) behave differently?
console.log('\n--- after a hard reload ---')
await p.reload({ waitUntil: 'domcontentloaded' })
await p.waitForTimeout(6000)
const r2 = await p.evaluate(() => {
  const m = document.querySelector('[data-connect-state]')
  return {
    marker: m
      ? { state: m.getAttribute('data-connect-state'), dbg: m.getAttribute('data-dbg') }
      : null,
    reviewsStillLoading: !!document.body.innerText.includes('Loading reviews'),
  }
})
console.log(JSON.stringify(r2, null, 2))

await b.close()