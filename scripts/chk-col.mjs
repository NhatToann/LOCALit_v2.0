import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(8000)
const r = await p.evaluate(() => {
  const col = [...document.querySelectorAll("a")].find(a=>(a.innerText||"").trim()==="Message")?.parentElement
  return {
    colChildren: col ? [...col.children].map(c => `${c.tagName}:"${(c.innerText||"").slice(0,40)}"`) : null,
    spinners: document.querySelectorAll(".animate-spin").length,
    // Where is the connect button?
    allButtons: [...document.querySelectorAll("button")].map(x=>(x.innerText||"").trim().slice(0,30)).filter(Boolean).slice(0,15),
  }
})
console.log(JSON.stringify(r, null, 2))
await b.close()
