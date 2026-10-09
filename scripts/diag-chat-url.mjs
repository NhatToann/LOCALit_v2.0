// scripts/diag-chat-url.mjs
// Sign in via Playwright, navigate to /chat, capture the actual conversations
// request URL, and confirm it uses the new embed (safe_profiles!fk).
import { chromium } from 'playwright'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  const requests = []
  page.on('request', (req) => {
    if (req.url().includes('/rest/v1/conversations')) {
      requests.push({ url: req.url(), method: req.method() })
    }
  })

  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#email', { timeout: 30000 })
  await page.fill('input#email', 'sarah.m@example.com')
  await page.fill('input#password', 'password123')
  await Promise.all([
    page.waitForURL('**/dashboard', { timeout: 15000 }),
    page.click('button:has-text("Sign in")'),
  ])

  await page.goto(`${BASE}/chat`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3000)

  console.log('Conversations requests sent:')
  for (const r of requests) {
    const decoded = decodeURIComponent(r.url.replaceAll('&', '\n  &'))
    console.log('  ', r.method, decoded)
  }
} finally {
  await browser.close()
}
