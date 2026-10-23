/**
 * LOCALit — the Da Nang photo set.
 *
 * SOURCE OF TRUTH
 * ---------------
 * The photos live in the repo's `asset/` folder — the project's own
 * image library. This module is the REGISTRY that gives each file a
 * name, a place, and a landmark. The pixel data itself is not here;
 * `scripts/build-backdrop-photos.mjs` reads `asset/` and writes the
 * responsive crops into `public/photos/`.
 *
 * WHY A REGISTRY AND NOT AN AUTO-SCAN
 * -----------------------------------
 * A photo needs a human-readable place name and an alt text that
 * describes what is actually in the frame. Guessing those from a
 * filename produces wrong labels, so every photo is declared here
 * explicitly. If you add a file to `asset/`, add an entry here too —
 * the build script will warn you if one is missing.
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
  /** Where the photo was taken — shown in the corner badge. */
  place: string
  /** Describes what is actually in the frame. */
  alt: string
}

export const PHOTOS: Photo[] = [
  {
    id: 'song-han-2',
    base: 'song-han-2',
    landmark: 'son-tra',
    place: 'Sơn Trà',
    alt: 'Coastline and green hills of the Sơn Trà peninsula near Da Nang',
  },
]

/**
 * The homepage hero photo.
 *
 * When the pool holds only ONE photo, there is nothing left for the
 * backdrop once the hero has taken it. Rather than showing the same
 * scene twice, the hero falls back to a solid brand teal and the
 * single photo goes to the site-wide backdrop. Add a second photo to
 * `asset/` and the hero becomes a photo again automatically.
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
