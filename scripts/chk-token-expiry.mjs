import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
const cdp = await p.context().newCDPSession(p)
await cdp.send("Network.enable")
const ev = []
cdp.on("Network.requestWillBeSent", e => {
  if (e.request.url.includes("/auth/v1/")) ev.push(e.request.url.split("/auth/v1")[1].split("?")[0])
})
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
ev.length = 0
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(6000)
const counts = {}
ev.forEach(e => counts[e] = (counts[e]||0)+1)
console.log("=== auth/v1 endpoints hit:", JSON.stringify(counts, null, 2))
// Check the JWT expiry
const r = await p.evaluate(() => {
  const cn = "sb-pqvnjgyqbxlylawwogjv-auth-token"
  const raw = document.cookie.split(";").map(s=>s.trim()).find(s=>s.startsWith(cn+"="))
  let v = decodeURIComponent(raw.slice(cn.length+1)).replace("base64-","")
  const b64 = v.replace(/-/g,"+").replace(/_/g,"/")
  const s = JSON.parse(atob(b64 + "=".repeat((4-(b64.length%4))%4)))
  const pl = s.access_token.split(".")[1].replace(/-/g,"+").replace(/_/g,"/")
  const c = JSON.parse(atob(pl + "=".repeat((4-(pl.length%4))%4)))
  return { exp: c.exp, now: Math.floor(Date.now()/1000), expiresInSec: c.exp - Math.floor(Date.now()/1000) }
})
console.log("token expires in:", r.expiresInSec, "seconds")
await b.close()
