#!/usr/bin/env node
// Check if A receives B's broadcast by hooking into the supabase channel
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

async function setupContext(label, geolocation) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    geolocation,
    permissions: ['geolocation'],
  })
  const page = await ctx.newPage()
  return { browser, page, ctx }
}

async function login(page) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', 'lan.pham@localit.dev')
  await page.fill('input#password', 'password123')
  await page.click('button:has-text("Sign in")')
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

const A = await setupContext('A', { latitude: 16.0544, longitude: 108.2023 })
const B = await setupContext('B', { latitude: 16.0700, longitude: 108.2300 })
await Promise.all([login(A.page), login(B.page)])

// On A: register an additional channel listener for verification.
await A.page.addInitScript(() => {
  // Wait for supabase to load and inject listener.
  setTimeout(() => {
    // Look for any module-level supabase reference
    const keys = Object.keys(window).filter(k => /supab/i.test(k))
    console.log('[A] supab keys:', keys)
    // @ts-ignore
    if (window.__supabase) {
      // @ts-ignore
      window.__supabase.channel('da-nang-live-locations-debug', {
        config: { broadcast: { self: false }, presence: { key: '' } },
      })
        .on('broadcast', { event: '*' }, (p) => {
          console.log('[A] RECEIVED BROADCAST:', JSON.stringify(p))
        })
        .subscribe((status) => {
          console.log('[A] debug sub status:', status)
        })
    }
  }, 3000)
})

await Promise.all([
  (async () => {
    await A.page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
    await A.page.waitForSelector('button:has-text("Share my location")')
    await A.page.click('button:has-text("Share my location")')
  })(),
  (async () => {
    await B.page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
    await B.page.waitForSelector('button:has-text("Share my location")')
    await B.page.click('button:has-text("Share my location")')
  })(),
])

await A.page.waitForTimeout(20000)

const aText = await A.page.evaluate(() => document.body.innerText.slice(0, 1000))
const bText = await B.page.evaluate(() => document.body.innerText.slice(0, 1000))

console.log('A peers found:', aText.match(/(\d+) live tourist/)?.[1])
console.log('B peers found:', bText.match(/(\d+) live tourist/)?.[1])

await A.browser.close()
await B.browser.close()