#!/usr/bin/env node
/**
 * ConnectButton renders NOTHING on /tourists/<id>. Not the spinner, not
 * "Connect with X", not Accept/Decline. Three candidate causes:
 *
 *   1. the component never mounts (server render dropped it)
 *   2. myId is null -> the "Sign in to connect" <a> should render
 *   3. loading stays true -> the spinner branch should render
 *
 * None of those produce an empty slot, so most likely the whole
 * <div> wrapper is missing from the served HTML. Check the raw RSC
 * payload rather than the hydrated DOM.
 */
import { chromium } from 'playwright'

const ORIGIN = 'https://localit-vn.vercel.app'
const BUDDY = { email: 'lan.pham@localit.dev', pw: 'password123' }
const TOURIST_ID = 'f2df98b0-96cf-451d-9d85-5060ddc1ca01'

const browser = await chromium.launch()
const ctx = await browser.newContext()
const page = await ctx.newPage()

try {
  await page.goto(`${ORIGIN}/login?switch=1`, { waitUntil: 'domcontentloaded' })
  await page.fill('input[type="email"]', BUDDY.email)
  await page.fill('input[type="password"]', BUDDY.pw)
  await page.click('button[type="submit"]')
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 25000 })

  // Capture every network request to connections
  const calls = []
  page.on('request', (r) => {
    if (r.url().includes('/rest/v1/connections')) {
      calls.push(`${r.method()} ${r.url().replace(/^https:\/\/[^/]+/, '')}`)
    }
  })

  await page.goto(`${ORIGIN}/tourists/${TOURIST_ID}`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(5000)

  console.log('=== connections API calls from this page ===')
  console.log(calls.join('\n') || '(NONE — component never fetched)')

  console.log('\n=== the action column: every anchor + button in the header area ===')
  const items = await page.evaluate(() => {
    const out = []
    document.querySelectorAll('a, button').forEach((el) => {
      const txt = (el.innerText || el.getAttribute('aria-label') || '').trim()
      if (txt) out.push(`<${el.tagName.toLowerCase()}> ${txt.slice(0, 60)}`)
    })
    return out
  })
  console.log(items.join('\n') || '(none)')

  console.log('\n=== does the HTML contain the word Connect at all? ===')
  const html = await page.content()
  for (const needle of ['Connect', 'Accept', 'Decline', 'Request pending', 'Sign in to connect']) {
    const n = (html.match(new RegExp(needle, 'g')) || []).length
    console.log(`  "${needle}": ${n} occurrence(s)`)
  }

  console.log('\n=== header action container markup ===')
  const markup = await page.evaluate(() => {
    const link = [...document.querySelectorAll('a')].find((a) =>
      (a.innerText || '').trim() === 'Message',
    )
    return link ? link.parentElement?.outerHTML?.slice(0, 900) : '(Message link not found)'
  })
  console.log(markup)
} catch (e) {
  console.error('FAILED:', e.message)
} finally {
  await browser.close()
}