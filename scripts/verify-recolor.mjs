// Visual verification of the 2026-10-09 recolor.
// Take screenshots of homepage, login, dashboard and check key colors.
import { chromium } from 'playwright'
import { mkdirSync } from 'fs'

const BASE = 'https://localit-nhattoann.vercel.app'
const BYPASS = 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'
const OUT = 'scripts/screenshots/recolor-2026-10-09'
mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ headless: true })
try {
  const ctx = await browser.newContext({
    extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
    viewport: { width: 1280, height: 900 },
  })
  const page = await ctx.newPage()

  // 1. Homepage (guest)
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${OUT}/01-homepage.png`, fullPage: true })
  console.log('[shot] 01-homepage')

  // 2. Login
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/02-login.png`, fullPage: true })
  console.log('[shot] 02-login')

  // 3. Register
  await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000)
  await page.screenshot({ path: `${OUT}/03-register.png`, fullPage: true })
  console.log('[shot] 03-register')

  // 4. Sign in as Mike Johnson
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('input#email', { timeout: 30000 })
  await page.fill('input#email', 'mike.j@example.com')
  await page.fill('input#password', 'password123')
  await page.click('button:has-text("Sign in")')
  try {
    await page.waitForURL('**/dashboard', { timeout: 10000 })
    await page.waitForTimeout(1500)
  } catch {
    console.log('[warn] login redirect did not arrive')
  }
  await page.screenshot({ path: `${OUT}/04-dashboard.png`, fullPage: true })
  console.log('[shot] 04-dashboard')

  // 5. Browse
  await page.goto(`${BASE}/browse`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/05-browse.png`, fullPage: true })
  console.log('[shot] 05-browse')

  // 6. Map
  await page.goto(`${BASE}/map`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(2500)
  await page.screenshot({ path: `${OUT}/06-map.png`, fullPage: true })
  console.log('[shot] 06-map')

  // Probe the primary color CSS variable to confirm the recolor actually
  // landed in the served stylesheet (not just on the build artifact).
  const probe = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement)
    return {
      primary: root.getPropertyValue('--color-primary').trim(),
      primaryHover: root.getPropertyValue('--color-primary-hover').trim(),
      primary500: root.getPropertyValue('--color-primary-500').trim(),
      primaryBg: root.getPropertyValue('--color-primary-bg').trim(),
      gradient: root.getPropertyValue('--color-gradient').trim(),
      // Also probe the actual rendered primary button
      btnBg: (() => {
        const btn = document.querySelector('a[href="/browse"], button[type="submit"]')
        return btn ? getComputedStyle(btn).backgroundColor : 'no btn found'
      })(),
    }
  })
  console.log('[probe]', JSON.stringify(probe, null, 2))
} finally {
  await browser.close()
}
