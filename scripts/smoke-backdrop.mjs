/**
 * LOCALit — verify the Da Nang backdrop renders behind everything and
 * stays subtle.
 *
 * Checks, on the local dev server:
 *   1. the backdrop <img> actually loaded (naturalWidth > 0)
 *   2. the backdrop photo is NOT the same as the homepage hero photo
 *   3. <body> and <html> backgrounds are transparent, so the -z-10
 *      layer is not painted over by an opaque parent
 *   4. the backdrop img is painted UNDER the page content (element
 *      hit-testing at a point where content sits returns content, not
 *      the backdrop)
 *   5. the backdrop is visually subtle — its effective opacity against
 *      the paper base is below a threshold, i.e. it reads as a texture
 *      and not as a feature
 *
 * Usage: node scripts/verify-backdrop.mjs [--url=http://localhost:3111]
 */
import { chromium } from 'playwright'

const args = process.argv.slice(2)
const baseArg = args.find((a) => a.startsWith('--url='))
const BASE = baseArg ? baseArg.split('=')[1] : 'http://localhost:3111'

const failures = []
const pass = (msg) => console.log(`PASS: ${msg}`)
const fail = (msg) => {
  console.log(`FAIL: ${msg}`)
  failures.push(msg)
}

const browser = await chromium.launch()
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } })
const page = await context.newPage()

try {
  // ---------- homepage ----------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const home = await page.evaluate(() => {
    const bd = document.querySelector('div.fixed.inset-0.-z-10')
    const img = bd?.querySelector('img')
    const hero = document.querySelector('section[aria-labelledby="hero-title"] > div')
    return {
      backdropSrc: img?.getAttribute('src') ?? null,
      naturalWidth: img?.naturalWidth ?? -1,
      opacity: img ? Number(getComputedStyle(img).opacity) : -1,
      filter: img ? getComputedStyle(img).filter : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      bdZ: bd ? getComputedStyle(bd).zIndex : null,
      heroBgImage: hero ? getComputedStyle(hero).backgroundImage : null,
    }
  })

  console.log('\n--- homepage ---')
  console.log(JSON.stringify(home, null, 2))

  // 1. loaded
  if (home.naturalWidth > 0) {
    pass(`backdrop image loaded (naturalWidth=${home.naturalWidth})`)
  } else {
    fail(`backdrop image did NOT load (naturalWidth=${home.naturalWidth})`)
  }

  // 3. transparent parents
  const isTransparent = (c) =>
    c === 'rgba(0, 0, 0, 0)' || c === 'transparent' || c === 'rgba(0,0,0,0)'
  if (isTransparent(home.bodyBg)) {
    pass(`body background is transparent (${home.bodyBg})`)
  } else {
    fail(`body background is opaque (${home.bodyBg}) — it will cover the backdrop`)
  }
  if (isTransparent(home.htmlBg)) {
    pass(`html background is transparent (${home.htmlBg})`)
  } else {
    fail(`html background is opaque (${home.htmlBg})`)
  }
  if (home.bdZ === '-10') {
    pass('backdrop is at z-index -10 (last painted layer)')
  } else {
    fail(`backdrop z-index is ${home.bdZ}, expected -10`)
  }

  // 2. hero and backdrop are different photos
  const heroUrl = (home.heroBgImage || '').match(/photos\/(?:desktop|tablet|mobile)\/([^')]+)/)?.[1]
  const bdUrl = (home.backdropSrc || '').match(/photos\/(?:desktop|tablet|mobile)\/([^/]+)/)?.[1]
  console.log(`hero=${heroUrl}  backdrop=${bdUrl}`)
  if (heroUrl && bdUrl && heroUrl !== bdUrl) {
    pass('hero and backdrop are different photos')
  } else {
    fail(`hero and backdrop show the SAME photo (${heroUrl} vs ${bdUrl})`)
  }

  // 2b. ...and not the same LANDMARK either. Two files of the same
  // subject (the Dragon Bridge at night, shot from two angles) still
  // read as a duplicated image to a visitor.
  const landmarks = await page.evaluate(() => {
    const hero = document.querySelector('section[aria-labelledby="hero-title"] > div')
    const heroStyle = hero ? getComputedStyle(hero).backgroundImage : ''
    const heroFile = heroStyle.match(/photos\/(?:desktop|tablet|mobile)\/([^')]+)/)?.[1]
    const bdFile = document
      .querySelector('div.fixed.inset-0.-z-10 img')
      ?.getAttribute('src')
      ?.match(/photos\/(?:desktop|tablet|mobile)\/([^/]+)/)?.[1]
    return { heroFile, bdFile }
  })
  const landmarkOf = (file) => {
    const key = (file || '').replace(/\.jpg$/, '')
    const map = {
      'han-river': 'dragon-bridge',
      'dragon-bridge': 'dragon-bridge',
      'my-khe-beach': 'my-khe-beach',
      'marble-mountains': 'marble-mountains',
    }
    return map[key] ?? key
  }
  if (
    landmarks.heroFile &&
    landmarks.bdFile &&
    landmarkOf(landmarks.heroFile) !== landmarkOf(landmarks.bdFile)
  ) {
    pass(
      `hero and backdrop show different landmarks (${landmarkOf(landmarks.heroFile)} vs ${landmarkOf(landmarks.bdFile)})`,
    )
  } else {
    fail(
      `hero and backdrop show the SAME landmark (${landmarkOf(landmarks.heroFile)} vs ${landmarkOf(landmarks.bdFile)})`,
    )
  }

  // 5. subtle
  if (home.opacity > 0 && home.opacity <= 0.3) {
    pass(`backdrop opacity ${home.opacity} is subtle (<= 0.3)`)
  } else {
    fail(`backdrop opacity ${home.opacity} is too strong (expected <= 0.3)`)
  }

  // 4. painted under content
  const hitTest = await page.evaluate(() => {
    // Find a card/section in the lower half of the page and check that
    // elementFromPoint returns content, not the backdrop layer.
    const el = document.elementFromPoint(720, 700)
    return {
      tag: el?.tagName ?? null,
      inBackdrop: !!(el && el.closest('div.fixed.inset-0.-z-10')),
    }
  })
  if (!hitTest.inBackdrop) {
    pass(`content paints over the backdrop (hit ${hitTest.tag})`)
  } else {
    fail('backdrop is painting OVER the page content')
  }

  // ---------- a second guest page ----------
  await page.goto(`${BASE}/browse`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const browse = await page.evaluate(() => {
    const img = document.querySelector('div.fixed.inset-0.-z-10 img')
    return {
      src: img?.getAttribute('src') ?? null,
      naturalWidth: img?.naturalWidth ?? -1,
    }
  })
  console.log('\n--- /browse ---')
  console.log(JSON.stringify(browse, null, 2))
  if (browse.naturalWidth > 0) {
    pass(`/browse backdrop loaded (naturalWidth=${browse.naturalWidth})`)
  } else {
    fail(`/browse backdrop did NOT load (naturalWidth=${browse.naturalWidth})`)
  }

  await page.screenshot({ path: 'scripts/screenshots/verify-backdrop.png', fullPage: false })
  console.log('\nscreenshot: scripts/screenshots/verify-backdrop.png')
} finally {
  await browser.close()
}

console.log(
  failures.length === 0
    ? '\nAll checks passed.'
    : `\n${failures.length} check(s) failed.`,
)
process.exit(failures.length === 0 ? 0 : 1)
