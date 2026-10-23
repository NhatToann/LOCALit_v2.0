/**
 * LOCALit — the Da Nang photo set.
 *
 * SOURCE OF TRUTH
 * ---------------
 * The photos live in the repo's `asset/` folder — the project's own
 * image library. This module is the REGISTRY that gives each file an
 * id, a landmark, and an alt text. The pixel data itself is not here;
 * `scripts/build-backdrop-photos.mjs` reads `asset/` and writes the
 * responsive crops into `public/photos/`.
 *
 * WHY A REGISTRY AND NOT AN AUTO-SCAN
 * -----------------------------------
 * A photo needs alt text that describes what is actually in the frame,
 * plus a landmark so the same scene is never shown twice on one page.
 * Guessing those from a filename produces wrong labels, so every photo
 * is declared here explicitly. If you add a file to `asset/`, add an
 * entry here too — the build script will warn you if one is missing.
 *
 * THE LANDMARK FIELD
 * ------------------
 * Two photos of the same subject (the Dragon Bridge at night, and
 * the Han River shot that also frames it) read as the same image to
 * a visitor, even though they are different files. The `landmark`
 * field is what lets the code exclude the hero's scene from the
 * backdrop rotation so the same bridge never appears twice on one
 * page.
 *
 * Two files therefore SHARE one landmark value rather than carrying
 * two names for the same scene: `han-river` and `dragon-bridge` both
 * declare `landmark: 'dragon-bridge'`. Do not "fix" these into two
 * distinct values — the hero filter below compares landmark strings
 * for equality, so distinct names would let the bridge back into the
 * rotation and put it on screen next to the hero.
 *
 * `scripts/smoke-backdrop.mjs` independently encodes the same rule
 * with a filename-to-landmark map, and treats the two as identical.
 *
 * GENERATED FILES
 * ---------------
 * For each entry, `scripts/build-backdrop-photos.mjs` writes:
 *
 *   public/photos/desktop/<base>.webp   1920x1080  (16:9)
 *   public/photos/tablet/<base>.webp    1024x768   (4:3)
 *   public/photos/mobile/<base>.webp     720x720   (1:1)
 */
export type Photo = {
  /** Stable key. */
  id: string
  /**
   * File basename in `asset/`, WITHOUT the extension.
   * Must match a file in `asset/` exactly.
   */
  base: string
  /**
   * The landmark depicted. Photos sharing a landmark are treated as
   * the same scene and never shown together.
   */
  landmark: string
  /** Describes what is actually in the frame. */
  alt: string
}

export const PHOTOS: Photo[] = [
  {
    id: 'han-river',
    base: 'han-river',
    // Shared landmark with `dragon-bridge` — see the note above.
    landmark: 'dragon-bridge',
    alt: 'Dragon Bridge and the Han River night skyline in Da Nang',
  },
  {
    id: 'dragon-bridge',
    base: 'dragon-bridge',
    landmark: 'dragon-bridge',
    alt: 'Dragon Bridge lit up at night in Da Nang',
  },
  {
    id: 'marble-mountains',
    base: 'marble-mountains',
    landmark: 'marble-mountains',
    alt: 'Limestone peaks of Marble Mountains near Da Nang',
  },
  {
    id: 'my-khe-beach',
    base: 'my-khe-beach',
    landmark: 'my-khe-beach',
    alt: 'My Khe Beach with the Son Tra hills behind it',
  },
  {
    id: 'song-han-2',
    base: 'song-han-2',
    landmark: 'son-tra',
    alt: 'Coastline and green hills of the Sơn Trà peninsula near Da Nang',
  },
]

/**
 * The homepage hero photo.
 *
 * The hero takes `PHOTOS[0]`, so the pool is ordered by how well the
 * opening frame works as a full-bleed banner: `han-river` (the
 * fireworks-night skyline) leads, and the rest follow.
 *
 * When the pool ever drops back to a single photo, there would be
 * nothing left for the backdrop once the hero had taken it. Rather
 * than showing the same scene twice, the hero then falls back to a
 * solid brand teal and the single photo goes to the site-wide
 * backdrop. `PHOTOS.length >= 2` below makes that automatic.
 */
export const HERO_BASE: string | null =
  PHOTOS.length >= 2 ? (PHOTOS[0]?.base ?? null) : null

/** Public path to the hero image, used for the LCP preload. */
export const HERO_IMAGE_URL: string | null = HERO_BASE
  ? `/photos/desktop/${HERO_BASE}.webp`
  : null

/** The hero's photo entry, if the pool has one. */
export const HERO_PHOTO: Photo | undefined = PHOTOS.find(
  (p) => p.base === HERO_BASE,
)

/**
 * Photos eligible for the site-wide backdrop.
 *
 * When there are 2+ photos, the hero's scene is excluded so the two
 * never show the same landmark on one page. When there is exactly 1
 * photo, it is used for the backdrop and the hero goes solid.
 */
export const BACKDROP_PHOTOS: Photo[] = (() => {
  if (PHOTOS.length <= 1) return PHOTOS
  return PHOTOS.filter((p) => p.landmark !== HERO_PHOTO?.landmark)
})()

/** Look up a photo entry by its base filename. */
export function photoByBase(base: string): Photo | undefined {
  return PHOTOS.find((p) => p.base === base)
}
