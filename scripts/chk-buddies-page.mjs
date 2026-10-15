import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const urls = []
p.on("request", r => { if (r.url().includes("/rest/v1/connections")) urls.push(r.url().split("rest/v1")[1].slice(0,100)) })
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
urls.length = 0
await p.goto("https://localit-vn.vercel.app/buddies/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(5000)
console.log("=== BUDDIES page (note: f2df98b0 is a TOURIST, so expect 404) ===")
console.log("url:", p.url())
console.log("404?", await p.locator("text=Page not found").count())
console.log("connections reqs:", urls.length)

urls.length = 0
console.log("\n=== Now a REAL buddy profile (Lan Pham viewing a buddy) ===")
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(5000)
console.log("url:", p.url())
console.log("404?", await p.locator("text=Page not found").count())
console.log("connections reqs:", urls.join("\n"))
console.log("spinner in actions:", await p.locator('.animate-spin').count())
console.log("buttons:", (await p.locator('main button, main a').allInnerTexts()).filter(t=>t.trim()).join(" | "))
await b.close()
