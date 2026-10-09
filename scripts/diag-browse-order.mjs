#!/usr/bin/env node
// Re-runs the first half of the save test to see which 2 rows
// are at positions 0 and 1 after the location-first sort.
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const SEED_EMAIL = 'sarah.m@example.com'
const SEED_PW = 'password123'

const browser = await chromium.launch({ headless: true })
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()
await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
await page.fill('input#email', SEED_EMAIL)
await page.fill('input#password', SEED_PW)
await Promise.all([
  page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 30000 }),
  page.click('button:has-text("Sign in")'),
])

await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' })
await page.waitForSelector('li button[aria-expanded]', { timeout: 30000 })
await page.waitForTimeout(1500)

const rows = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('li button[aria-expanded]')).map((h, i) => {
    const name = h.querySelector('p.text-sm.font-medium span')?.textContent?.trim()
    const role = h.querySelector('.badge')?.textContent?.trim()
    const dist = h.textContent?.match(/([\d.]+)\s*km\s*away/)?.[1]
    return { i, name, role, dist }
  })
})
console.log('Rows in DOM order:')
console.table(rows)

await browser.close()
