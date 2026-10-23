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

// Vercel Deployment Protection gates every request to the production
// alias with an SSO wall. Without this header the page we test is the
// Vercel login screen, not LOCALit — the assertions below then fail
// for a reason that has nothing to do with the backdrop.
const BYPASS = {
  'x-vercel-protection-bypass': 'w6XAcwiXyFf9Pea8I6zwVONXAhc8Xs9A',
}

const failures = []
const pass = (msg) => console.log(`PASS: ${msg}`)
const fail = (msg) => {
  console.log(`FAIL: ${msg}`)
  failures.push(msg)
}

const browser = await chromium.launch()
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  extraHTTPHeaders: BYPASS,
})
const page = await context.newPage()

try {
  // ---------- homepage ----------
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1200)

  const home = await page.evaluate(() => {
    const bd = document.querySelector('div.fixed.inset-0.-z-10')
    const img = bd?.querySelector('img')
    // Target the layers BY CLASS, never by position. The hero renders an
    // optional photo layer followed by the scrim, so `> div:first-child`
    // is the photo when the pool holds 2+ images and the scrim when it
    // holds one — the old positional selector silently read the wrong
    // element and reported a false "scrim is opaque" failure.
    const heroPhoto = document.querySelector('.hero-photo')
    return {
      backdropSrc: img?.getAttribute('src') ?? null,
      naturalWidth: img?.naturalWidth ?? -1,
      opacity: img ? Number(getComputedStyle(img).opacity) : -1,
      filter: img ? getComputedStyle(img).filter : null,
      bodyBg: getComputedStyle(document.body).backgroundColor,
      htmlBg: getComputedStyle(document.documentElement).backgroundColor,
      bdZ: bd ? getComputedStyle(bd).zIndex : null,
      heroBgImage: heroPhoto ? getComputedStyle(heroPhoto).backgroundImage : null,
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

  // When the photo pool has a single image, the hero falls back to a
  // solid teal and the photo goes to the backdrop. That is the
  // expected shape, not a duplicate.
  if (!heroUrl && bdUrl) {
    pass('single-photo pool: hero is solid, backdrop carries the photo')
  } else if (heroUrl && bdUrl && heroUrl !== bdUrl) {
    pass('hero and backdrop are different photos')
  } else {
    fail(`hero and backdrop show the SAME photo (${heroUrl} vs ${bdUrl})`)
  }

  // 2c. the hero scrim must be TRANSLUCENT, not an opaque block.
  // 2026-10-23 regression guard: on a single-photo pool the hero used
  // to paint `background: var(--color-primary-900)` — fully opaque —
  // straight over the photo, so the Da Nang photography was completely
  // hidden behind the hero.
  const scrim = await page.evaluate(() => {
    const el = document.querySelector('.hero-scrim')
    if (!el) return null
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, bgImage: cs.backgroundImage }
  })
  const alphaOf = (c) => {
    const m = (c || '').match(/rgba?\(([^)]+)\)/)
    if (!m) return 1
    const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
    return parts.length === 4 ? parts[3] : 1
  }
  const scrimAlpha = alphaOf(scrim?.bg)
  if (scrim && scrimAlpha > 0 && scrimAlpha < 1) {
    pass(`hero scrim is translucent (alpha ${scrimAlpha}) — the photo reads through`)
  } else {
    fail(`hero scrim is OPAQUE (${scrim?.bg}) — it hides the photo underneath`)
  }
  if ((scrim?.bgImage ?? 'none') === 'none') {
    pass('hero scrim is ONE solid color (no gradient, per AGENTS.md)')
  } else {
    fail(`hero scrim has a background-image (${scrim?.bgImage}) — must be a solid color`)
  }

  // 2d. paper-white hero text must stay readable on the composited
  // result. Samples the REAL photos (same-origin, so canvas is
  // allowed), replays the whole layer stack and reports the worst-case
  // WCAG ratio against #FFFFFF.
  //
  // The stack depends on the pool shape:
  //   2+ photos -> hero photo layer (opaque) + scrim on top. The site
  //                backdrop is NOT visible through the hero at all.
  //   1 photo   -> no hero photo, so the stack is paper base ->
  //                backdrop photo (with its CSS filter) -> brand wash
  //                -> scrim, and the backdrop IS what shows through.
  // The hero sits at the top of the page, so the photo's upper half is
  // the region the text actually lands on.
  const contrast = await page.evaluate(async () => {
    const bdRoot = document.querySelector('div.fixed.inset-0.-z-10')
    const bd = bdRoot?.querySelector('img')
    const scrimEl = document.querySelector('.hero-scrim')
    if (!scrimEl) return null

    const scrimCs = getComputedStyle(scrimEl)
    const heroPhotoEl = document.querySelector('.hero-photo')
    const heroUrl = heroPhotoEl
      ? (getComputedStyle(heroPhotoEl).backgroundImage.match(/url\(["']?([^"')]+)["']?\)/) ?? [])[1]
      : null

    // Load the hero photo through a detached <img> — a background-image
    // is not paintable via drawImage, but the same bytes are.
    let heroImg = null
    if (heroUrl) {
      heroImg = await new Promise((resolve) => {
        const im = new Image()
        im.onload = () => resolve(im)
        im.onerror = () => resolve(null)
        im.src = heroUrl
      })
    }

    const c = document.createElement('canvas')
    c.width = 64
    c.height = 32
    const ctx = c.getContext('2d', { willReadFrequently: true })
    const srcH = (img) => img.naturalHeight * 0.5
    const paint = (img) => {
      ctx.filter = 'none'
      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      ctx.drawImage(img, 0, 0, img.naturalWidth, srcH(img), 0, 0, c.width, c.height)
    }

    if (heroImg && heroImg.naturalWidth) {
      // Hero has its own opaque photo: that IS the backdrop for the
      // hero region. Sample it unfiltered — no opacity, no filter.
      paint(heroImg)
    } else if (bd && bd.naturalWidth) {
      // Single-photo pool: replay the site-wide backdrop stack.
      const bdCs = getComputedStyle(bd)
      const paper = bdRoot.querySelector('div')
      ctx.fillStyle = getComputedStyle(paper).backgroundColor
      ctx.fillRect(0, 0, c.width, c.height)
      // Chromium honours `ctx.filter`, so the sample is the tone the
      // visitor actually sees.
      ctx.filter = bdCs.filter && bdCs.filter !== 'none' ? bdCs.filter : 'none'
      ctx.globalAlpha = Number(bdCs.opacity)
      paint(bd)
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = 'rgba(15, 118, 110, 0.12)'
      ctx.fillRect(0, 0, c.width, c.height)
    } else {
      return null
    }

    ctx.filter = 'none'
    ctx.globalAlpha = 1
    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = scrimCs.backgroundColor
    ctx.fillRect(0, 0, c.width, c.height)

    const { data } = ctx.getImageData(0, 0, c.width, c.height)
    const lin = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    let worst = Infinity
    let worstPx = null
    for (let i = 0; i < data.length; i += 4) {
      const L = 0.2126 * lin(data[i]) + 0.7152 * lin(data[i + 1]) + 0.0722 * lin(data[i + 2])
      const ratio = 1.05 / (L + 0.05)
      if (ratio < worst) {
        worst = ratio
        worstPx = [data[i], data[i + 1], data[i + 2]]
      }
    }
    return {
      worst: Number(worst.toFixed(2)),
      worstPx,
      source: heroUrl ? 'hero photo' : 'site-wide backdrop',
    }
  })
  console.log(
    `worst-case white-on-hero contrast: ${contrast?.worst}:1 at rgb(${contrast?.worstPx}) (${contrast?.source})`,
  )
  if (contrast && contrast.worst >= 4.5) {
    pass(`white hero text clears WCAG AA (${contrast.worst}:1 worst case)`)
  } else {
    fail(`white hero text contrast is ${contrast?.worst}:1 — below the 4.5:1 AA floor`)
  }

  // hero screenshot — the visual proof that the photo reads through
  await page
    .locator('section[aria-labelledby="hero-title"]')
    .screenshot({ path: 'scripts/screenshots/hero-translucent.png' })
  console.log('screenshot: scripts/screenshots/hero-translucent.png')

  // 2b. ...and not the same LANDMARK either. Two files of the same
  // subject (the Dragon Bridge at night, shot from two angles) still
  // read as a duplicated image to a visitor.
  const landmarks = await page.evaluate(() => {
    const hero = document.querySelector('.hero-photo')
    const heroStyle = hero ? getComputedStyle(hero).backgroundImage : ''
    const heroFile = heroStyle.match(/photos\/(?:desktop|tablet|mobile)\/([^')]+)/)?.[1]
    const bdFile = document
      .querySelector('div.fixed.inset-0.-z-10 img')
      ?.getAttribute('src')
      ?.match(/photos\/(?:desktop|tablet|mobile)\/([^/]+)/)?.[1]
    return { heroFile, bdFile }
  })
  if (!landmarks.heroFile && landmarks.bdFile) {
    pass('single-photo pool: no landmark collision to check')
  } else {
    const landmarkOf = (file) => {
      const key = (file || '').replace(/\.webp$/, '')
      const map = {
        'han-river': 'dragon-bridge',
        'dragon-bridge': 'dragon-bridge',
        'my-khe-beach': 'my-khe-beach',
        'marble-mountains': 'marble-mountains',
        'song-han-2': 'son-tra',
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
  }

  // 5. subtle
  if (home.opacity > 0 && home.opacity <= 0.5) {
    pass(`backdrop opacity ${home.opacity} is subtle (<= 0.5)`)
  } else {
    fail(`backdrop opacity ${home.opacity} is out of range (expected 0 < x <= 0.5)`)
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

  // ---------- 6. page headings stay legible on the light backdrop ----------
  //
  // 2026-10-23 regression guard. `.text-page-title` and
  // `.text-section-title` were BOTH white, because the backdrop used
  // to be a heavy multi-plied teal wash. The wash is gone — the
  // backdrop is now a light, desaturated photo texture — so white
  // text on it measured 1.33:1 and every page H1 above the photo
  // (/browse, /dashboard, /map, /search, ...) was effectively
  // invisible. The homepage hero keeps white because it carries its
  // own dark `.hero-scrim`.
  //
  // This asserts the real thing: measure the ACTUAL composited
  // pixels behind each heading on the real page and check the
  // computed text colour clears WCAG AA against them.
  const headings = await page.evaluate(async () => {
    const lin = (v) => {
      v /= 255
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
    }
    const relLum = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
    const ratio = (l1, l2) =>
      (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05)

    // Replay the backdrop layer stack once, into a canvas we can
    // sample for any heading.
    const bdRoot = document.querySelector('div.fixed.inset-0.-z-10')
    const bd = bdRoot?.querySelector('img')
    const c = document.createElement('canvas')
    c.width = 256
    c.height = 144
    const ctx = c.getContext('2d', { willReadFrequently: true })
    if (bd && bd.naturalWidth) {
      const bdCs = getComputedStyle(bd)
      const paper = bdRoot.querySelector('div')
      ctx.fillStyle = getComputedStyle(paper).backgroundColor
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.filter = bdCs.filter && bdCs.filter !== 'none' ? bdCs.filter : 'none'
      ctx.globalAlpha = Number(bdCs.opacity)
      ctx.drawImage(bd, 0, 0, bd.naturalWidth, bd.naturalHeight * 0.5, 0, 0, c.width, c.height)
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      ctx.globalCompositeOperation = 'multiply'
      ctx.fillStyle = 'rgba(15, 118, 110, 0.12)'
      ctx.fillRect(0, 0, c.width, c.height)
      ctx.globalCompositeOperation = 'source-over'
    }
    const { data } = ctx.getImageData(0, 0, c.width, c.height)

    const bgAt = (frac) => {
      const x = Math.min(c.width - 1, Math.max(0, Math.floor(c.width * frac)))
      const i = (Math.floor(c.height / 2) * c.width + x) * 4
      return relLum(data[i], data[i + 1], data[i + 2])
    }

    const results = []
    document.querySelectorAll('h1, h2').forEach((el) => {
      const cs = getComputedStyle(el)
      const m = cs.color.match(/rgba?\(([^)]+)\)/)
      if (!m) return
      const parts = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
      const alpha = parts.length === 4 ? parts[3] : 1
      // Composite the text colour over the background at its own
      // alpha before measuring — `text-paper/85` is a real value.
      const bgL = bgAt(0.5)
      const fgL = relLum(parts[0], parts[1], parts[2])
      const mixedL = fgL * alpha + bgL * (1 - alpha)
      results.push({
        text: (el.textContent || '').trim().slice(0, 30),
        color: cs.color,
        ratio: Number(ratio(mixedL, bgL).toFixed(2)),
        onDarkCard: !!el.closest('[class*="bg-ink"], .btn-tourist, .btn-buddy'),
      })
    })
    return results
  })

  console.log('\n--- heading contrast over the backdrop ---')
  headings.forEach((h) => console.log(`  ${h.ratio}:1  ${h.color}  "${h.text}"`))

  const lowContrast = headings.filter((h) => h.ratio < 4.5)
  if (lowContrast.length === 0) {
    pass(
      `all ${headings.length} page headings clear WCAG AA over the backdrop (min ${Math.min(...headings.map((h) => h.ratio))}:1)`,
    )
  } else {
    for (const h of lowContrast) {
      fail(
        `heading "${h.text}" is ${h.color} on the light backdrop — only ${h.ratio}:1, below the 4.5:1 AA floor`,
      )
    }
  }

  // ---------- 7. card surfaces are TRANSLUCENT ----------
  //
  // 2026-10-23 regression guard. Every card used to paint an opaque
  // white / mint rectangle, so the Da Nang photo backdrop was
  // invisible behind a wall of solid cards — the user asked for the
  // photo to read through the div backgrounds.
  //
  // The glass utilities must (a) actually be emitted by Tailwind —
  // registering the token in `:root` alone does NOT generate the
  // utility class — and (b) carry a real alpha below 1.
  const glass = await page.evaluate(() => {
    const els = [
      ...document.querySelectorAll('[class*="bg-paper-glass"]'),
      ...document.querySelectorAll('[class*="bg-surface-glass"]'),
    ]
    const alphaOf = (c) => {
      const m = (c || '').match(/rgba?\(([^)]+)\)/)
      if (!m) return null
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number)
      return p.length === 4 ? p[3] : 1
    }
    return {
      count: els.length,
      alphas: els.slice(0, 6).map((e) => ({
        cls: e.className.slice(0, 60),
        bg: getComputedStyle(e).backgroundColor,
        alpha: alphaOf(getComputedStyle(e).backgroundColor),
      })),
    }
  })
  console.log('\n--- glass card surfaces ---')
  console.log(JSON.stringify(glass, null, 2))
  if (glass.count === 0) {
    fail('no glass card surfaces found — the Tailwind utility was not emitted')
  } else {
    const opaque = glass.alphas.filter((a) => a === null || a >= 1)
    if (opaque.length === 0) {
      pass(
        `${glass.count} card surface(s) are translucent (alphas ${glass.alphas.map((a) => a.alpha).join(', ')})`,
      )
    } else {
      for (const a of opaque) {
        fail(`card surface "${a.cls}" is opaque (${a.bg}) — it hides the backdrop`)
      }
    }
  }

  // ---------- 8. the auth pages render the backdrop for GUESTS ----------
  //
  // The auth branch in AppShell was the only one that mounted no
  // photo layer, so a guest landing on /login saw a flat white page
  // while a signed-in user saw the Da Nang photography.
  await page.goto(`${BASE}/login?switch=1`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)
  const auth = await page.evaluate(() => {
    const img = document.querySelector('div.fixed.inset-0.-z-10 img')
    return { naturalWidth: img?.naturalWidth ?? -1 }
  })
  if (auth.naturalWidth > 0) {
    pass(`/login renders the Da Nang backdrop for guests (naturalWidth=${auth.naturalWidth})`)
  } else {
    fail(`/login has NO backdrop for guests (naturalWidth=${auth.naturalWidth})`)
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
