import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const codes = []
p.on("response", async r => {
  if (r.url().includes("/auth/v1/user")) codes.push(r.status())
})
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
codes.length = 0
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(6000)
console.log("=== /auth/v1/user response codes ===")
const counts = {}
codes.forEach(c => counts[c] = (counts[c]||0)+1)
console.log(counts)
await b.close()
