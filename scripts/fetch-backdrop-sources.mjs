/**
 * LOCALit — fetch candidate Da Nang photos from Wikimedia Commons.
 *
 * The backdrop photos used to be hard-coded Unsplash CDN URLs. Four of
 * the nine IDs were deleted upstream, including the FIRST one (the SSR
 * default for every fresh guest session), which is why guests saw a
 * flat white page while signed-in users saw a photo.
 *
 * This script pulls open-licensed Da Nang photos from Wikimedia Commons
 * into `public/photos/originals/` as a starting point. Run
 * `node scripts/build-backdrop-photos.mjs` afterwards to crop them into
 * the three responsive sizes.
 *
 * Every file is attributed to its Commons page in
 * `public/photos/ATTRIBUTION.md`.
 *
 * USAGE
 *   node scripts/fetch-backdrop-sources.mjs            # fetch only missing
 *   node scripts/fetch-backdrop-sources.mjs --force    # re-fetch everything
 */
import { mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ORIGINALS_DIR = path.join(ROOT, 'public', 'photos', 'originals')
const ATTRIBUTION_PATH = path.join(ROOT, 'public', 'photos', 'ATTRIBUTION.md')

const USER_AGENT = 'LOCALit-dev/1.0 (backdrop photo fetcher)'
const FORCE = process.argv.includes('--force')

/**
 * Each entry: the Commons file title (without the `File:` prefix), the
 * basename we save it under, and the landmark it depicts. The title is
 * resolved through the Commons API so the real file URL comes from
 * Wikimedia itself — no hand-written URLs to rot.
 */
const SOURCES = [
  {
    title: 'Da Nang International Fireworks Festival DIFF Dragon Bridge Han River night skyline Vietnam.jpg',
    base: 'han-river',
    place: 'Han River',
    alt: 'Dragon Bridge and the Han River night skyline in Da Nang',
  },
  {
    title: 'My Khe Beach, Da Nang, Vietnam.jpg',
    base: 'my-khe-beach',
    place: 'My Khe Beach',
    alt: 'My Khe Beach with the Son Tra hills behind it',
  },
  {
    title: 'Da Nang - Dragon Bridge.jpg',
    base: 'dragon-bridge',
    place: 'Dragon Bridge',
    alt: 'Dragon Bridge lit up at night in Da Nang',
  },
  {
    title: 'MarbleMts SBCA.jpg',
    base: 'marble-mountains',
    place: 'Marble Mountains',
    alt: 'Limestone peaks of Marble Mountains',
  },
]

/** Commons rate-limits aggressively — pause between API calls. */
const API_DELAY_MS = 1200
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))


async function api(params) {
  const url = `https://commons.wikimedia.org/w/api.php?${params}`
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Commons API ${res.status} for ${params}`)
  return res.json()
}

async function resolve(title) {
  const json = await api(
    new URLSearchParams({
      action: 'query',
      titles: `File:${title}`,
      prop: 'imageinfo',
      iiprop: 'url|extmetadata',
      iiurlwidth: '2400',
      format: 'json',
    }).toString(),
  )
  const pages = json?.query?.pages ?? {}
  const page = Object.values(pages)[0]
  if (!page || page.missing !== undefined) {
    throw new Error(`Commons file not found: ${title}`)
  }  const info = page.imageinfo?.[0]
  if (!info) throw new Error(`No imageinfo for: ${title}`)

  // Prefer the scaled thumbnail — it is a plain JPEG/PNG on the
  // upload.wikimedia.org origin, which serves reliably.
  const downloadUrl = info.thumburl ?? info.url
  const meta = info.extmetadata ?? {}
  return {
    downloadUrl,
    descriptionUrl: info.descriptionurl,
    license: meta.LicenseShortName?.value ?? 'see Commons',
    artist: (meta.Artist?.value ?? '').replace(/<[^>]*>/g, '').trim(),
  }
}

async function download(url, dest) {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } })
  if (!res.ok) throw new Error(`Download ${res.status} for ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  await writeFile(dest, buf)
  return buf.length
}

async function main() {
  await mkdir(ORIGINALS_DIR, { recursive: true })

  const attribution = []
  let ok = 0
  let skipped = 0

  for (const source of SOURCES) {
    const outPath = path.join(ORIGINALS_DIR, `${source.base}.jpg`)

    if (existsSync(outPath) && !FORCE) {
      console.log(`  skip  ${source.base}.jpg (already present)`)
      skipped++
      continue
    }

    try {
      const info = await resolve(source.title)
      await sleep(API_DELAY_MS)
      const bytes = await download(info.downloadUrl, outPath)
      console.log(
        `  ok    ${source.base}.jpg  ${String(Math.round(bytes / 1024)).padStart(4)} KB  ← ${source.title}`,
      )
      attribution.push({ ...source, ...info })
      ok++
    } catch (err) {
      console.error(`  FAIL  ${source.base}: ${err.message}`)
    }
    await sleep(API_DELAY_MS)
  }

  if (attribution.length > 0) {
    const lines = [
      '# Backdrop photo attribution',
      '',
      'The Da Nang photographs behind every page come from Wikimedia Commons',
      'and are used under their respective open licenses.',
      '',
      'Regenerate with:',
      '',
      '```bash',
      'node scripts/fetch-backdrop-sources.mjs',
      'node scripts/build-backdrop-photos.mjs',
      '```',
      '',
      '| File | Place | Source | Author | License |',
      '| --- | --- | --- | --- | --- |',
      ...attribution.map(
        (a) =>
          `| \`${a.base}.jpg\` | ${a.place} | [Commons page](${a.descriptionUrl}) | ${a.artist || '—'} | ${a.license} |`,
      ),
      '',
    ]
    await writeFile(ATTRIBUTION_PATH, lines.join('\n'), 'utf8')
    console.log(`\n[fetch-backdrop] Wrote attribution to ${ATTRIBUTION_PATH}`)
  }

  console.log(
    `\n[fetch-backdrop] ${ok} fetched, ${skipped} skipped, ${SOURCES.length - ok - skipped} failed`,
  )
  console.log(`[fetch-backdrop] Next: node scripts/build-backdrop-photos.mjs`)

  if (ok === 0 && skipped === 0) {
    process.exit(1)
  }
}

main().catch((err) => {
  console.error('[fetch-backdrop] Failed:', err)
  process.exit(1)
})
