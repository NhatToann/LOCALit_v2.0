import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const chunks = []
p.on("response", r => { if (r.url().includes("/_next/static/") && r.url().endsWith(".js")) chunks.push(r.url()) })
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
chunks.length = 0
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"networkidle"})
await p.waitForTimeout(3000)
for (const u of chunks) {
  const body = await (await fetch(u)).text()
  if (body.includes("auth-token") || body.includes("access_token")) {
    console.log("HAS auth logic:", u.split("/").pop())
    // does it have the b64 padding?
    console.log("   has 4 - padding:", body.includes("(4 - "))
  }
}
await b.close()
