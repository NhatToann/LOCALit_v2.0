#!/usr/bin/env node
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  geolocation: { latitude: 16.0544, longitude: 108.2023 },
  permissions: ['geolocation'],
})
const page = await ctx.newPage()
page.on('console', msg => {
  const t = msg.text()
  if (t.includes('live-locations') || t.includes('postgres')) {
    console.log(`[${msg.type()}]`, t.slice(0, 300))
  }
})

await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input#email', 'lan.pham@localit.dev')
await page.fill('input#password', 'password123')
await page.click('button:has-text("Sign in")')
await page.waitForURL('**/dashboard', { timeout: 15000 })

await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('button:has-text("Share my location")', { timeout: 10000 })
await page.click('button:has-text("Share my location")', { force: true })
await page.waitForTimeout(20000)
await browser.close()