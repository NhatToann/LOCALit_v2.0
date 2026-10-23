/**
 * LOCALit — backdrop photo build script.
 *
 * WHY THIS EXISTS
 * --------------
 * The site background used to point at hard-coded Unsplash URLs.
 * Four of the nine photo IDs have since been deleted upstream, and
 * the FIRST one (the SSR default every fresh guest session renders)
 * was one of the dead ones — so guests saw a flat white page while
 * signed-in users, whose sessionStorage held a different photo index,
 * saw a photo. Switching to images stored in the repo removes the
 * whole class of bug: no third-party origin, no 404, no ORB block.
 *
 * WHAT IT DOES
 * ------------
 * Reads every original photo in `public/photos/originals/` and writes
 * three cropped sizes into `public/photos/{desktop,tablet,mobile}/`:
 *
 *   desktop  1920x1080  (16:9)  — full bleed on wide screens
 *   tablet   1024x768   (4:3)   — 640px..1023px viewports
 *   mobile    720x720   (1:1)   — <640px viewports
 *
 * The crop is `attention` (sharp's saliency-based crop) so the focal
 * point of each photo survives, and the output is a progressive JPEG
 * at quality 78 — visually indistinguishable from the source at the
 * sizes we serve, but ~70% smaller.
 *
 * USAGE
 * -----
 *   1. Drop your source photos into `public/photos/originals/`
 *   2. node scripts/build-backdrop-photos.mjs
 *   3. The generated files land in public/photos/<size>/<name>.jpg
 *
 * The script is idempotent — re-run it any time you add a photo.
 * It also prints a ready-to-paste manifest so you can update
 * `components/layout/DaNangBackdrop.tsx` without hunting for URLs.
 */
import { readdir, mkdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PHOTOS_DIR = path.join(ROOT, 'public', 'photos')
const ORIGINALS_DIR = path.join(PHOTOS_DIR, 'originals')

/** Output targets: folder name, width, height, quality. */
const TARGETS = [
  { dir: 'desktop', width: 1920, height: 1080, quality: 78 },
  { dir: 'tablet', width: 1024, height: 768, quality: 78 },
  { dir: 'mobile', width: 720, height: 720, quality: 78 },
]

const IMAGE_EXT = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif'])

async function main() {
  if (!existsSync(ORIGINALS_DIR)) {
    console.error(
      `\n[build-backdrop] No originals directory at:\n  ${ORIGINALS_DIR}\n\n` +
        `Create it and drop your Da Nang photos in, then re-run:\n` +
        `  node scripts/build-backdrop-photos.mjs\n`,
    )
    process.exit(1)
  }

  const entries = await readdir(ORIGINALS_DIR, { withFileTypes: true })
  const sources = entries
    .filter((e) => e.isFile() && IMAGE_EXT.has(path.extname(e.name).toLowerCase()))
    .map((e) => e.name)
    .sort()

  if (sources.length === 0) {
    console.error(
      `\n[build-backdrop] ${ORIGINALS_DIR} has no images.\n` +
        `Supported: ${[...IMAGE_EXT].join(', ')}\n`,
    )
    process.exit(1)
  }

  console.log(`[build-backdrop] ${sources.length} source photo(s) found\n`)

  for (const target of TARGETS) {
    await mkdir(path.join(PHOTOS_DIR, target.dir), { recursive: true })
  }

  const manifest = []

  for (const name of sources) {
    const base = path.basename(name, path.extname(name))
    const input = path.join(ORIGINALS_DIR, name)
    const meta = await sharp(input).metadata()
    const sourceLine = `${meta.width}x${meta.height}`

    const sizes = {}
    for (const target of TARGETS) {
      const outName = `${base}.jpg`
      const outPath = path.join(PHOTOS_DIR, target.dir, outName)

      await sharp(input)
        .resize(target.width, target.height, {
          fit: 'cover',
          position: 'attention',
          // Keep the crop from being upscaled past the source —
          // a 600px-wide original should not become a blurry 1920px.
          withoutEnlargement: false,
        })
        .jpeg({ quality: target.quality, progressive: true, mozjpeg: true })
        .toFile(outPath)

      const info = await stat(outPath)
      sizes[target.dir] = {
        path: `/photos/${target.dir}/${outName}`,
        bytes: info.size,
      }
      console.log(
        `  ${base.padEnd(22)} ${target.dir.padEnd(8)} ${target.width}x${target.height}  ${String(
          Math.round(info.size / 1024),
        ).padStart(4)} KB`,
      )
    }

    manifest.push({ base, source: sourceLine, ...sizes })
    console.log(`  ${' '.repeat(22)} (source ${sourceLine})`)
  }

  const manifestPath = path.join(PHOTOS_DIR, 'manifest.json')
  await writeFile(
    manifestPath,
    JSON.stringify(
      {
        generatedBy: 'scripts/build-backdrop-photos.mjs',
        note: 'Regenerate with: node scripts/build-backdrop-photos.mjs',
        photos: manifest,
      },
      null,
      2,
    ) + '\n',
    'utf8',
  )

  console.log(`\n[build-backdrop] Wrote ${manifest.length} entries to`)
  console.log(`  ${manifestPath}`)
  console.log(`\n[build-backdrop] Now update components/layout/DaNangBackdrop.tsx`)
  console.log(`  with the paths above (see PHOTOS array).`)
}

main().catch((err) => {
  console.error('[build-backdrop] Failed:', err)
  process.exit(1)
})
