import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const all = []
p.on("request", r => { if (r.url().includes("auth/v1/user") || r.url().includes("/auth/v1/")) all.push(r.method()+" "+r.url().split("/auth/v1")[1]) })
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
console.log("=== auth requests during login ===")
console.log(all.join("\n") || "(none)")
all.length = 0
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(8000)
console.log("\n=== auth requests on the tourist page ===")
console.log(all.join("\n") || "(NONE - getUser never called / never resolved)")
await b.close()
