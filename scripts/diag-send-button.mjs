// scripts/diag-send-button.mjs
// Reproduces the "Send verification code button does nothing" complaint.
//
// The hypothesis: Step 1's submit button is gated on `stepReady`, which needs
// ALL of: fullName>=2, valid email, valid password, password===confirm, terms.
// When any one is false the button gets `disabled` — but `.btn-tourist` in
// globals.css has NO `:disabled` rule, so the browser's default disabled
// styling (greyed-out text, no hover) is suppressed by `color: #FFFFFF` on
// `background-color: var(--color-tourist)`. The result is a button that LOOKS
// fully enabled but silently does nothing on click. Silent failure = the
// reported symptom.
//
// This script drives the real form and reports, for each field, whether the
// button is enabled and what the browser thinks its computed style is.
import { chromium } from 'playwright'

const BASE = process.env.TARGET_URL ?? 'https://localit-nhattoann.vercel.app'
const BYPASS = process.env.VERCEL_BYPASS_TOKEN ?? 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A'

const browser = await chromium.launch()
const ctx = await browser.newContext({
  extraHTTPHeaders: { 'x-vercel-protection-bypass': BYPASS },
})
const page = await ctx.newPage()

const errors = []
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
page.on('console', (m) => {
  if (m.type() === 'error') errors.push(`console.error: ${m.text()}`)
})

console.log(`Navigating to ${BASE}/register ...`)
await page.goto(`${BASE}/register`, { waitUntil: 'domcontentloaded', timeout: 60_000 })

const submit = page.locator('button[type="submit"]').first()
await submit.waitFor({ state: 'visible', timeout: 30_000 })

async function probe(label) {
  const disabled = await submit.isDisabled()
  const box = await submit.boundingBox()
  const styles = await submit.evaluate((el) => {
    const cs = getComputedStyle(el)
    return {
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      cursor: cs.cursor,
      opacity: cs.opacity,
      pointerEvents: cs.pointerEvents,
    }
  })
  console.log(`\n[${label}]`)
  console.log(`  disabled      = ${disabled}`)
  console.log(`  boundingBox   = ${box ? `${Math.round(box.width)}x${Math.round(box.height)} @ ${Math.round(box.x)},${Math.round(box.y)}` : 'null'}`)
  console.log(`  color         = ${styles.color}`)
  console.log(`  background    = ${styles.backgroundColor}`)
  console.log(`  cursor        = ${styles.cursor}`)
  console.log(`  opacity       = ${styles.opacity}`)
  console.log(`  pointerEvents = ${styles.pointerEvents}`)
  return { disabled, styles, box }
}

// --- 1. Empty form: button should be disabled -----------------------------
const empty = await probe('empty form')

// --- 2. Fill everything except terms --------------------------------------
await page.fill('#fullName', 'Dark Luna')
await page.fill('#email', `probe.${Date.now()}@gmail.com`)
await page.fill('#password', 'Abcdef123!')
await page.fill('#confirmPassword', 'Abcdef123!')
await page.waitForTimeout(200)
const noTerms = await probe('filled, terms NOT ticked')

// --- 3. Tick terms — should enable ----------------------------------------
await page.check('input[type="checkbox"]')
await page.waitForTimeout(200)
const withTerms = await probe('filled + terms ticked')

// --- 4. Click it and see if anything happens -------------------------------
console.log('\nClicking "Send verification code" ...')
let stepAfter = ''
try {
  await submit.click({ timeout: 10_000 })
  // If the click worked we advance to the verify-otp step. Wait for either
  // the "Check your email" heading or an error alert.
  await page
    .waitForFunction(
      () => {
        const h = document.body.innerText
        return h.includes('Check your email') || h.includes('Could not')
      },
      { timeout: 25_000 },
    )
    .catch(() => {})
  stepAfter = (await page.locator('h1').first().innerText().catch(() => '')).trim()
} catch (e) {
  stepAfter = `CLICK BLOCKED: ${e.message.split('\n')[0]}`
}
console.log(`  screen after click = "${stepAfter}"`)

// --- 5. Try a real DOM click on the disabled button -----------------------
const forceClick = await submit.evaluate((el) => {
  // If the button is truly disabled, dispatchEvent won't fire a click either.
  const before = document.activeElement?.tagName
  el.click()
  return { wasDisabled: el.disabled, activeBefore: before }
})
console.log(`  programmatic click → ${JSON.stringify(forceClick)}`)

console.log('\n--- console/page errors ---')
console.log(errors.length ? errors.join('\n') : '(none)')

console.log('\n--- verdict ---')
if (empty.disabled && !withTerms.disabled && stepAfter.includes('Check your email')) {
  console.log('PASS — the button gates correctly and the flow advances.')
} else if (empty.disabled && withTerms.disabled) {
  console.log('BUG — button stays disabled even with every field filled.')
} else if (!empty.disabled) {
  console.log('BUG — button is enabled on an empty form (gate not applied).')
} else {
  console.log(`REVIEW — enabled=${withTerms.disabled === false} but screen is "${stepAfter}".`)
}
if (empty.styles.pointerEvents !== 'none' && empty.styles.opacity === '1') {
  console.log(
    'STYLING BUG — disabled button keeps full colour + cursor, so it LOOKS clickable. That is the "nothing happens" illusion.',
  )
}

await page.screenshot({ path: 'scripts/screenshots/diag-send-button.png', fullPage: true })
console.log('\nScreenshot → scripts/screenshots/diag-send-button.png')

await browser.close()