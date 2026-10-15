import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"networkidle"})
await p.waitForTimeout(4000)
// Does the loading-spinner (page-level Suspense fallback) still exist? That tells us if hydration finished.
console.log("page-level loading-spinner count:", await p.locator(".loading-spinner").count())
console.log("header avatar logged in?", await p.locator('button[aria-label*="account" i]').count())
console.log("Sign out visible?", await p.locator('text=Sign out').count())
// Watch for React hydration markers
const rsc = await p.evaluate(() => {
  const t = document.querySelector('template[id^="B:"]')
  return { hasTemplate: !!t, mainHTML: document.querySelector('main')?.innerHTML.length }
})
console.log("RSC:", JSON.stringify(rsc))
await b.close()
