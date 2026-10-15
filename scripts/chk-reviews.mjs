import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const cdp = await p.context().newCDPSession(p)
await cdp.send("Network.enable")
const reqs = []
cdp.on("Network.responseReceived", e => {
  if (e.response.url.includes("/rest/v1/reviews")) reqs.push(e.response.status + " " + e.response.url.split("?")[1]?.slice(0,40))
})
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
reqs.length = 0
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(8000)
console.log("=== reviews responses ===")
console.log(reqs.join("\n") || "(none)")
const ui = await p.evaluate(() => ({
  loading: document.body.innerText.includes("Loading reviews"),
  connectText: [...document.querySelectorAll("button")].map(x=>(x.innerText||"").trim()).filter(t=>/connect|accept|decline|cancel/i.test(t)),
}))
console.log(JSON.stringify(ui, null, 2))
await b.close()
