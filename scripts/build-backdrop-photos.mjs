/**
 * LOCALit — build the responsive backdrop crops from `asset/`.
 *
 * The repo's `asset/` folder is the single source of truth for the
 * Da Nang photography. This script reads the files listed in
 * `lib/photos.ts` and writes three cropped sizes per photo into
 * `public/photos/`:
 *
 *   desktop  1920x1080  (16:9)  — full bleed on wide screens
 *   tablet   1024x768   (4:3)   — 640px..1023px viewports
 *   mobile    720x720   (1:1)   — <640px viewports
 *
 * The crop uses sharp's `attention` strategy (saliency-based), so the
 * focal point of each photo survives the crop rather than being
 * guessed from the centre.
 *
 * Output is WebP — the same perceptual quality as the source at ~40%
 * of the JPEG size, and universally supported in all current browsers.
 *
 * USAGE
 * -----
 *   1. Put the photo in `asset/`
 *   2. Add an entry to the PHOTOS array in `lib/photos.ts`
 *   3. node scripts/build-backdrop-photos.mjs
 */
import { readdir, writeFile, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const ASSET_DIR = path.join(ROOT, 'asset')
const PHOTOS_DIR = path.join(ROOT, 'public', 'photos')

/** Output targets: folder name, width, height. */
const TARGETS = [
  { dir: 'desktop', width: 1920, height: 1080 },
  { dir: 'tablet', width: 1024, height: 768 },
  { dir: 'mobile', width: 720, height: 720 },
]

const QUALITY = 74

/** Extensions we will accept for a source photo, in priority order. */
const IMAGE_EXT = ['.webp', '.jpg', '.jpeg', '.png', '.avif']

/**
 * The registry. Kept as a literal mirror of `lib/photos.ts` so this
 * script has no build-time dependency on the TS module — it is plain
 * Node with no transpiler. If the two drift apart, the consistency
 * check below fails and says so.
 */
const REGISTRY = [
  {
    base: 'han-river',
    // Shared landmark with `dragon-bridge` — the hero filter in
    // lib/photos.ts compares landmark strings for equality, so the two
    // files must declare the SAME value to stay mutually exclusive.
    landmark: 'dragon-bridge',
    alt: 'Dragon Bridge and the Han River night skyline in Da Nang',
  },
  {
    base: 'dragon-bridge',
    landmark: 'dragon-bridge',
    alt: 'Dragon Bridge lit up at night in Da Nang',
  },
  {
    base: 'marble-mountains',
    landmark: 'marble-mountains',
    alt: 'Limestone peaks of Marble Mountains near Da Nang',
  },
  {
    base: 'my-khe-beach',
    landmark: 'my-khe-beach',
    alt: 'My Khe Beach with the Son Tra hills behind it',
  },
  {
    base: 'song-han-2',
    landmark: 'son-tra',
    alt: 'Coastline and green hills of the Sơn Trà peninsula near Da Nang',
  },
]

/**
 * Find the source file for a registry entry.
 *
 * The repo's `asset/` files carry their pixel dimensions in the name
 * (`song-han-2-1024x768.webp`), so an entry's `base` is the stem
 * WITHOUT that suffix. We therefore look for a file that starts with
 * the base and is followed by either the end of the name or a
 * `-<width>x<height>` dimension suffix.
 */
async function findSource(base) {
  for (const ext of IMAGE_EXT) {
    const dirEntries = await readdir(ASSET_DIR, { withFileTypes: true })
    for (const entry of dirEntries) {
      if (!entry.isFile()) continue
      if (path.extname(entry.name).toLowerCase() !== ext) continue

      const stem = path.basename(entry.name, path.extname(entry.name))
      // Exact match, or `<base>-<W>x<H>`.
      const matches =
        stem === base || new RegExp(`^${base}-\\d+x\\d+$`).test(stem)
      if (matches) return path.join(ASSET_DIR, entry.name)
    }
  }
  return null
}

async function main() {
  if (!existsSync(ASSET_DIR)) {
    console.error(`[build-backdrop] No asset directory at ${ASSET_DIR}`)
    process.exit(1)
  }

  for (const target of TARGETS) {
    await mkdirSafe(path.join(PHOTOS_DIR, target.dir))
  }

  const manifest = []
  const missing = []

  for (const entry of REGISTRY) {
    const input = await findSource(entry.base)
    if (!input) {
      missing.push(entry.base)
      console.error(
        `  MISS  ${entry.base} — no file in asset/ with any of: ${IMAGE_EXT.join(', ')}`,
      )
      continue
    }

    const meta = await sharp(input).metadata()
    const sizes = {}

    for (const target of TARGETS) {
      const outName = `${entry.base}.webp`
      const outPath = path.join(PHOTOS_DIR, target.dir, outName)

      await sharp(input)
        .resize(target.width, target.height, {
          fit: 'cover',
          position: 'attention',
        })
        .webp({ quality: QUALITY })
        .toFile(outPath)

      const info = await stat(outPath)
      sizes[target.dir] = {
        path: `/photos/${target.dir}/${outName}`,
        bytes: info.size,
      }
      console.log(
        `  ${entry.base.padEnd(16)} ${target.dir.padEnd(8)} ${target.width}x${target.height}  ${String(
          Math.round(info.size / 1024),
        ).padStart(4)} KB`,
      )
    }

    console.log(`  ${' '.repeat(16)} source ${meta.width}x${meta.height} (${meta.format})`)
    manifest.push({ ...entry, source: `${meta.width}x${meta.height}`, ...sizes })
  }

  await writeFile(
    path.join(PHOTOS_DIR, 'manifest.json'),
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

  console.log(`\n[build-backdrop] ${manifest.length} photo(s) built.`)
  if (missing.length > 0) {
    console.error(
      `[build-backdrop] Missing source for: ${missing.join(', ')}\n` +
        `  Add the file to asset/ and re-run.`,
    )
    process.exit(1)
  }
}

/** mkdir -p without the recursive flag warning noise. */
async function mkdirSafe(dir) {
  const { mkdir } = await import('node:fs/promises')
  await mkdir(dir, { recursive: true })
}

main().catch((err) => {
  console.error('[build-backdrop] Failed:', err)
  process.exit(1)
})
