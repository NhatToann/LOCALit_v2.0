import { chromium } from 'playwright'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A' },
  viewport: { width: 1280, height: 900 },
})
const page = await ctx.newPage()

await page.goto('https://localit-nhattoann.vercel.app/login', { waitUntil: 'domcontentloaded' })
await page.waitForSelector('#email')
await page.fill('#email', 'lan.pham@localit.dev')
await page.fill('#password', 'password123')
await page.click('button[type="submit"]')
await page.waitForURL((u) => !u.toString().includes('/login'), { timeout: 20000 })
console.log('logged in')

// Hit /profile and capture the cookies being used
const cookies = await page.context().cookies()
console.log('cookies:')
for (const c of cookies) {
  if (c.name.startsWith('sb-') || c.name.includes('auth')) {
    console.log(`  ${c.name}=${c.value.slice(0, 30)}...`)
  }
}

// Get user id from the page
const url = page.url()
console.log('current url:', url)

// Now hit /api/me or something to confirm
const me = await page.evaluate(async () => {
  const sbCookies = document.cookie
  return sbCookies
})
console.log('document cookies:', me.slice(0, 200))

// Visit /profile and look at the response HTML
const res = await page.goto('https://localit-nhattoann.vercel.app/profile', { waitUntil: 'domcontentloaded' })
console.log('response status:', res?.status())
await page.waitForTimeout(2000)
const html = await page.content()
const hasBuddyText = html.includes('Buddy-specific bio')
const hasTouristText = html.includes('Travel preferences')
const hasAboutMe = html.includes('About me')
const hasProfileNotFound = html.includes('Profile not found')
const hasAccountText = html.includes("doesn't have a role")
console.log('hasBuddyText:', hasBuddyText)
console.log('hasTouristText:', hasTouristText)
console.log('hasAboutMe:', hasAboutMe)
console.log('hasProfileNotFound:', hasProfileNotFound)
console.log('hasAccountText:', hasAccountText)
await page.screenshot({ path: 'scripts/screenshots/debug-lan-html.png', fullPage: true })

await browser.close()
