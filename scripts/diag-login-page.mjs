// Quick diag: what does /login look like?
import { chromium } from 'playwright'

const PROD = 'https://localit-p898m9fi1-nhattoann.vercel.app'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()
  page.on('console', (m) => console.log('console:', m.type(), m.text().slice(0, 200)))
  page.on('pageerror', (e) => console.log('pageerror:', String(e).slice(0, 300)))
  page.on('response', (r) => {
    if (r.status() >= 400) console.log('HTTP', r.status(), r.url())
  })
  await page.goto(`${PROD}/login`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(8000) // generous hydrate wait
  const url = page.url()
  console.log('Final URL:', url)
  const inputs = await page.locator('input').all()
  console.log(`Found ${inputs.length} <input> elements`)
  for (const i of inputs) {
    const type = await i.getAttribute('type')
    const name = await i.getAttribute('name')
    const placeholder = await i.getAttribute('placeholder')
    const visible = await i.isVisible()
    console.log(`  type=${type} name=${name} ph=${placeholder} visible=${visible}`)
  }
  await page.screenshot({ path: 'scripts/screenshots/login-debug.png', fullPage: true })
  await browser.close()
}
run().catch((e) => { console.error(e); process.exit(1) })