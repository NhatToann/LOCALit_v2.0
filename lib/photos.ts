/**
 * LOCALit — the Da Nang photo set, in one place.
 *
 * Both the homepage hero and the global page backdrop draw from this
 * list, so they must agree on the filenames. Keeping the source of
 * truth here (instead of duplicating a URL string in two components)
 * is what guarantees the hero photo and the backdrop photo can never
 * end up being the same scene on the same page.
 *
 * FILES
 * -----
 * Every entry needs three generated crops, produced by
 * `node scripts/build-backdrop-photos.mjs`:
 *
 *   public/photos/desktop/<base>.jpg   1920x1080  (16:9)
 *   public/photos/tablet/<base>.jpg    1024x768   (4:3)
 *   public/photos/mobile/<base>.jpg     720x720   (1:1)
 *
 * To add a photo: drop the original in `public/photos/originals/`,
 * run the build script, then add an entry here.
 */
export type Photo = {
  /** Stable key — used for the rotation index. */
  id: string
  /** File basename (no extension) inside public/photos/<size>/. */
  base: string
  /**
   * The landmark depicted. Two photos of the SAME landmark (for
   * example the Dragon Bridge shot at night and another taken from
   * across the river) read as the same image to a visitor, so the
   * backdrop rotation treats them as one and never shows both.
   */
  landmark: string
  /** Where the photo was taken — shown in the corner badge. */
  place: string
  /** Describes the scene. */
  alt: string
}

export const PHOTOS: Photo[] = [
  {
    id: 'han-river',
    base: 'han-river',
    landmark: 'dragon-bridge',
    place: 'Han River',
    alt: 'Dragon Bridge and the Han River night skyline in Da Nang',
  },
  {
    id: 'my-khe-beach',
    base: 'my-khe-beach',
    landmark: 'my-khe-beach',
    place: 'My Khe Beach',
    alt: 'My Khe Beach with the Son Tra peninsula and the beachfront highrises behind it',
  },
  {
    id: 'dragon-bridge',
    base: 'dragon-bridge',
    landmark: 'dragon-bridge',
    place: 'Dragon Bridge',
    alt: 'Dragon Bridge lit up at night in Da Nang',
  },
  {
    id: 'marble-mountains',
    base: 'marble-mountains',
    landmark: 'marble-mountains',
    place: 'Marble Mountains',
    alt: 'Limestone peaks of the Marble Mountains near Da Nang',
  },
]

/**
 * The homepage hero photo. It is deliberately NOT part of the backdrop
 * rotation on `/` — see `DaNangBackdrop` — because the hero already
 * shows this scene at full strength and repeating it directly below
 * reads as a rendering bug rather than a design choice.
 */
export const HERO_BASE = 'han-river'

/** Public path to the hero image, used for the LCP preload. */
export const HERO_IMAGE_URL = `/photos/desktop/${HERO_BASE}.jpg`

/** Look up a photo entry by its base filename. */
export function photoByBase(base: string): Photo | undefined {
  return PHOTOS.find((p) => p.base === base)
}
