import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const msgs = []
p.on("console", m => msgs.push(`[${m.type()}] ${m.text().slice(0,200)}`))
p.on("pageerror", e => msgs.push(`[pageerror] ${e.message.slice(0,300)}`))
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
msgs.length = 0
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(7000)
console.log("=== ALL console output on the tourist page ===")
console.log(msgs.join("\n") || "(none)")
await b.close()
