import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const conn = []
p.on("request", r => { if (r.url().includes("/rest/v1/connections")) conn.push(r.method()+" "+r.url().split("rest/v1")[1]) })
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(7000)
console.log("=== ALL connections requests ===")
console.log(conn.join("\n") || "(NONE)")
console.log("\n=== auth/user requests ===")
const authReqs = []
console.log("=== can we query auth from the page? ===")
const res = await p.evaluate(async () => {
  try {
    const r = await fetch("/api/auth/me")
    return r.status
  } catch(e) { return "err " + e.message }
})
console.log("api/auth/me ->", res)
await b.close()
