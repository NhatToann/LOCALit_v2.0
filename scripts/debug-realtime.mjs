#!/usr/bin/env node
// Detailed 2-device trace, watching for live-locations messages
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

async function setupContext(label, geolocation, email) {
  const browser = await chromium.launch({ headless: true })
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    geolocation,
    permissions: ['geolocation'],
  })
  const page = await ctx.newPage()
  const messages = []
  page.on('console', msg => {
    const t = msg.text()
    if (t.includes('live-locations') || t.includes('[postgres')) {
      messages.push(`[${label}] ${t.slice(0, 200)}`)
    }
  })
  return { browser, page, ctx, messages, email }
}

async function login(page, email) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.fill('input#email', email)
  await page.fill('input#password', 'password123')
  await page.click('button:has-text("Sign in")')
  await page.waitForURL('**/dashboard', { timeout: 15000 })
}

const A = await setupContext('A', { latitude: 16.0544, longitude: 108.2023 }, 'lan.pham@localit.dev')
const B = await setupContext('B', { latitude: 16.0700, longitude: 108.2300 }, 'john.doe@example.com')
await Promise.all([login(A.page, A.email), login(B.page, B.email)])

await Promise.all([
  (async () => {
    await A.page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
    await A.page.waitForSelector('button:has-text("Share my location")')
    await A.page.click('button:has-text("Share my location")', { force: true })
  })(),
  (async () => {
    await B.page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
    await B.page.waitForSelector('button:has-text("Share my location")')
    await B.page.click('button:has-text("Share my location")', { force: true })
  })(),
])

await A.page.waitForTimeout(20000)
await B.page.waitForTimeout(20000)

const aText = await A.page.evaluate(() => document.body.innerText.match(/(\d+) live tourist/)?.[1])
const bText = await B.page.evaluate(() => document.body.innerText.match(/(\d+) live tourist/)?.[1])

console.log('=== A messages ===')
A.messages.forEach(m => console.log(m))
console.log('=== B messages ===')
B.messages.forEach(m => console.log(m))
console.log(`\nA peers=${aText}, B peers=${bText}`)
await A.browser.close()
await B.browser.close()