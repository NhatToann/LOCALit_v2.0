import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
let t0 = Date.now()
const reqs = []
p.on("request", r => { if (r.url().includes("/rest/v1/connections")) reqs.push(`+${Date.now()-t0}ms ${r.url().split("rest/v1")[1].slice(0,90)}`) })
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
await p.goto("https://localit-vn.vercel.app/tourists/f2df98b0-96cf-451d-9d85-5060ddc1ca01", {waitUntil:"domcontentloaded"})
t0 = Date.now(); reqs.length = 0
await p.waitForTimeout(6000)
console.log("=== connections requests (post-nav) ===")
console.log(reqs.join("\n") || "(NONE)")
const spin = await p.locator('div.flex.flex-col.gap-2 .animate-spin').count()
console.log("\nspinner count in action column:", spin)
const html = await p.evaluate(() => {
  const a = [...document.querySelectorAll('a')].find(x => (x.innerText||'').trim()==='Message')
  return a ? a.parentElement.innerHTML.slice(0, 400) : "(not found)"
})
console.log("\n=== action column HTML ===")
console.log(html)
await b.close()
