import { chromium } from "playwright"
const b = await chromium.launch()
const p = await (await b.newContext()).newPage()
// Use the CDP stack trace to find WHO initiates the /auth/v1/user call
const cdp = await p.context().newCDPSession(p)
await cdp.send("Network.enable")
await cdp.send("Runtime.enable")
const stacks = []
cdp.on("Network.requestWillBeSent", e => {
  if (e.request.url.includes("/auth/v1/user")) {
    const f = e.initiator?.stack
    const frames = (f?.callFrames || []).slice(0,4).map(x => `${x.functionName || "anon"}@${(x.url||"").split("/").pop()}:${x.lineNumber}`)
    stacks.push(frames.join(" <- "))
  }
})
await p.goto("https://localit-vn.vercel.app/login?switch=1", {waitUntil:"domcontentloaded"})
await p.fill('input[type="email"]', "lan.pham@localit.dev")
await p.fill('input[type="password"]', "password123")
await p.click('button[type="submit"]')
await p.waitForURL(u => !u.pathname.startsWith("/login"), {timeout:25000})
stacks.length = 0
await p.goto("https://localit-vn.vercel.app/buddies/22222222-2222-2222-2222-222222222222", {waitUntil:"domcontentloaded"})
await p.waitForTimeout(6000)
console.log("=== /auth/v1/user initiators (", stacks.length, ") ===")
const uniq = [...new Set(stacks)]
uniq.forEach(s => console.log("\n" + s))
await b.close()
