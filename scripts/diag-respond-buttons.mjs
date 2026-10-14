#!/usr/bin/env node
/**
 * Why are the Respond buttons missing on a connection request?
 *
 * The tourist profile page renders now, but there is no Accept / Decline.
 * ConnectButton only shows those when a `connections` row exists with the
 * right shape. Possible causes:
 *   a) the row is absent            -> "Connect with X" instead
 *   b) the row exists but the RLS SELECT on connections hides it
 *   c) the component never fetched (client-side error)
 *
 * Dumps the DOM the user actually sees, plus the API view of the row.
 */
import { chromium } from 'playwright'

const ORIGIN = 'https://localit-vn.vercel.app'
const BUDDY = { email: 'lan.pham@localit.dev', pw: 'password123' }
const TOURIST_ID = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'
const BUDDY_ID = '11111111-1111-1111-1111-111111111111'

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

const logs = []
page.on('console', (m) => logs.push(`${m.type()}: ${m.text()}`))
page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`))

try {
  await page.goto(`${ORIGIN}/login?switch=1`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', BUDDY.email)
  await page.fill('input[type="password"]', BUDDY.pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })
  console.log('logged in ->', page.url())

  console.log('\n=== A. The notification popover contents ===')
  await page.waitForTimeout(2500)
  const bell = page.locator('[aria-label*="otification" i], button:has(svg.lucide-bell)').first()
  await bell.click()
  await page.waitForTimeout(1500)
  const popoverText = await page
    .locator('[role="dialog"], [role="menu"], [data-state="open"]')
    .first()
    .innerText()
    .catch(() => '(popover not found)')
  console.log('--- popover text ---')
  console.log(popoverText || '(empty)')

  console.log('\n=== B. Does the app call the API for connections? ===')
  const apiCalls = []
  page.on('request', (r) => {
    const u = r.url()
    if (u.includes('/rest/v1/') && (u.includes('connections') || u.includes('notification'))) {
      apiCalls.push(`${r.method()} ${u.replace(/^https:\/\/[^/]+/, '')}`)
    }
  })

  console.log('\n=== C. The tourist profile page: what connect UI is rendered? ===')
  await page.keyboard.press('Escape')
  await page.goto(`${ORIGIN}/tourists/${TOURIST_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(3500)

  const apiSummary = await page.evaluate(async () => {
    const el = document.querySelector('main') || document.body
    return el.innerText.slice(0, 1200)
  })
  console.log('--- page text ---')
  console.log(apiSummary)

  console.log('\n--- buttons on the page ---')
  const buttons = await page.locator('button').allInnerTexts()
  console.log(buttons.filter(Boolean).join(' | ') || '(no buttons)')

  console.log('\n--- any ConnectButton-ish markup ---')
  const connectMarkup = await page.evaluate(() => {
    const m = document.body.innerHTML.match(/.{0,120}(Connect with|Accept|Decline|Pending|pending).{0,120}/g)
    return m ? m.slice(0, 6) : []
  })
  console.log(connectMarkup.join('\n---\n') || '(no connect/accept text found)')

  console.log('\n=== D. API calls made on this page ===')
  console.log(apiCalls.join('\n') || '(none captured)')

  console.log('\n=== E. Console output ===')
  console.log(logs.slice(-25).join('\n') || '(none)')
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await browser.close()
}