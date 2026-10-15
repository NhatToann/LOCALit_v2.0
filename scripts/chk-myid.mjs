import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(6000)
const r = await p.evaluate(() => {
  const el = document.querySelector('[data-connect-state]')
  if (!el) return { marker: null }
  return { state: el.getAttribute('data-connect-state'), myId: el.getAttribute('data-my-id') }
})
console.log(JSON.stringify(r))
await b.close()
