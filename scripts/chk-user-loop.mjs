import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const stack = []
p.on("request", r => {
  if (r.url().includes("/auth/v1/user")) {
    stack.push({ url: r.url(), t: Date.now(), initiator: r.frame() ? "frame" : "page" })
  }
})
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
stack.length = 0
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(6000)
console.log("total /auth/v1/user calls:", stack.length)
if (stack.length > 1) {
  const t0 = stack[0].t
  const gaps = stack.slice(1).map((s,i) => s.t - stack[i].t)
  console.log("gaps ms:", gaps.slice(0,15).join(", "))
}
await b.close()
