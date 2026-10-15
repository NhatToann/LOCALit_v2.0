import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
// Patch fetch to trace who calls /auth/v1/user and whether connections is ever queried
await p.addInitScript(() => {
  const orig = window.fetch
  window.__trace = []
  window.fetch = function(...args) {
    const url = typeof args[0] === "string" ? args[0] : args[0]?.url || ""
    if (url.includes("/auth/v1/user") || url.includes("/rest/v1/connections")) {
      window.__trace.push(url.split("supabase.co")[1]?.slice(0,70))
    }
    return orig.apply(this, args)
  }
})
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
await p.evaluate(() => { window.__trace = [] })
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(6000)
const trace = await p.evaluate(() => window.__trace)
console.log("=== traced fetch calls ===")
console.log(trace.join("\n") || "(none via fetch - supabase-js uses XHR)")
await b.close()
