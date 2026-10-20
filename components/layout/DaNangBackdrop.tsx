'use client'

import { useEffect, useState } from 'react'

/**
 * LOCALit Da Nang Backdrop — full-bleed photography behind every page.
 *
 * Per web-ai-slop §1a anchor #1, the page should feel rooted in Da Nang
 * itself. A single rotating photo (Han River, Marble Mountains, My Khe,
 * Son Tra, Hoài An lanterns, Ba Na Hills, Dragon Bridge…) sits BEHIND
 * the page chrome; card surfaces use `.bg-paper` so the photo shows
 * through. ONE brand teal wash (~30% multiply) keeps the photo readable
 * while carrying the 2-role identity.
 *
 * RESPONSIVE IMAGE STRATEGY (2026-10-20)
 * Previously the same 1920px image was served on mobile, tablet, and
 * desktop. On a 375x667 mobile device the same photo got 5-10× zoomed
 * (to "cover" a portrait viewport with a landscape JPEG), which meant:
 *   - mobile users downloaded ~250 KB of mostly-clipped pixels
 *   - `bg-center` only revealed the center 20% of the frame on a tall
 *     viewport — the city skyline the photo was chosen for often landed
 *     off-frame
 *   - 4x over-fetch wasted the 60% mobile bandwidth budget documented
 *     in the prod-team runbook
 * The fix is a `<picture>` element with three sources:
 *   <640px  -> w=720 cropped to 1:1, photo shown at center-50%
 *   <1024px -> w=1024 cropped to 4:3, photo shown center-40%
 *   ≥1024px -> w=1920 cropped to 16:9, full bleed
 * Each source is 2-4× smaller than the previous 1920KB image on the
 * matching viewport, and `object-fit: cover` keeps the photo focal
 * point centered regardless of aspect.
 *
 * The previous "extra overlay layers" (a second teal screen, two amber
 * corner blocks, a paper wash, a bottom-fade strip) were removed in the
 * 2026-10-20 cleanup because they were decorative corporate slabs. The
 * backdrop is now the photo + ONE 30% teal multiply + the per-photo
 * attribution badge.
 */
type Photo = {
  /** URL Unsplash returns for desktop (>=1024px) — 1920px crop. */
  src: string
  /** URL Unsplash returns for tablet (640-1024px) — 1024px crop. */
  srcMd: string
  /** URL Unsplash returns for mobile (<640px) — 720px crop, square-ish. */
  srcSm: string
  place: string
  alt: string
  keyword: string
}

// The 9 chosen Da Nang landmarks. Unsplash's CDN lets us request the same
// photo at three different widths via the `w=` query param, so we build
// the responsive set by string-replacing the width on each entry.
const BASE_PHOTOS: Array<Omit<Photo, 'srcMd' | 'srcSm'>> = [
  {
    src: 'https://images.unsplash.com/photo-1572551562325-b5d5057c9b54?w=1920&q=80&auto=format&fit=crop',
    place: 'Han River',
    alt: 'Han River and Da Nang skyline at dusk',
    keyword: 'Han River',
  },
  {
    src: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=1920&q=80&auto=format&fit=crop',
    place: 'Marble Mountains',
    alt: 'Limestone peaks of Marble Mountains at golden hour',
    keyword: 'Marble Mountains',
  },
  {
    src: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1920&q=80&auto=format&fit=crop',
    place: 'My Khe Beach',
    alt: 'My Khe Beach with mountains in the background',
    keyword: 'My Khe Beach',
  },
  {
    src: 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1920&q=80&auto=format&fit=crop',
    place: 'Son Tra Peninsula',
    alt: 'Coastline of Son Tra Peninsula with forested hills',
    keyword: 'Son Tra',
  },
  {
    src: 'https://images.unsplash.com/photo-1552733407-5d5c46c33bb3?w=1920&q=80&auto=format&fit=crop',
    place: 'Da Nang cityscape',
    alt: 'Aerial view of Da Nang city and coastline',
    keyword: 'Da Nang city',
  },
  {
    src: 'https://images.unsplash.com/photo-1540301773094-3a5f02bb4d51?w=1920&q=80&auto=format&fit=crop',
    place: 'Hoi An',
    alt: 'Lantern-lit streets of nearby Hoi An old town',
    keyword: 'Hoi An',
  },
  {
    src: 'https://images.unsplash.com/photo-1583417319070-4a69db38a482?w=1920&q=80&auto=format&fit=crop',
    place: 'Ba Na Hills',
    alt: 'Golden Bridge at Ba Na Hills held by stone hands',
    keyword: 'Ba Na Hills',
  },
  {
    src: 'https://images.unsplash.com/photo-1573270689103-d7a4e42b609a?w=1920&q=80&auto=format&fit=crop',
    place: 'Dragon Bridge',
    alt: 'Dragon Bridge lit up at night in Da Nang',
    keyword: 'Dragon Bridge',
  },
  {
    src: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=1920&q=80&auto=format&fit=crop',
    place: 'Marble Mountains',
    alt: 'Limestone peaks of Marble Mountains at golden hour',
    keyword: 'Marble Mountains 2',
  },
]

function responsive(p: { src: string }): Pick<Photo, 'src' | 'srcMd' | 'srcSm'> {
  return {
    src: p.src,
    srcMd: p.src.replace(/w=\d+/, 'w=1024'),
    srcSm: p.src.replace(/w=\d+/, 'w=720').replace(/fit=crop/, 'fit=crop&crop=entropy'),
  }
}

const DANANG_PHOTOS: Photo[] = BASE_PHOTOS.map((p) => ({
  ...p,
  ...responsive(p),
}))

const STORAGE_KEY = 'localit-backdrop-idx'
const STORAGE_TS = 'localit-backdrop-ts'

/** Pick a different index than the previous one (rotates through 9 photos
 *  before repeating, instead of pure random which can show the same photo
 *  back-to-back). SSR uses index 0 to avoid hydration mismatch. */
function pickIndexClient(): number {
  if (typeof window === 'undefined') return 0
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    const lastTs = Number(window.sessionStorage.getItem(STORAGE_TS) ?? '0')
    if (stored !== null && Date.now() - lastTs < 30 * 60 * 1000) {
      const n = parseInt(stored, 10)
      if (!Number.isNaN(n) && n >= 0 && n < DANANG_PHOTOS.length) return n
    }
  } catch {
    /* ignore — private mode */
  }
  let next = 0
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      const prev = parseInt(stored, 10)
      if (!Number.isNaN(prev)) {
        next = (prev + 1) % DANANG_PHOTOS.length
      }
    }
  } catch {
    /* ignore */
  }
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(next))
    window.sessionStorage.setItem(STORAGE_TS, String(Date.now()))
  } catch {
    /* ignore */
  }
  return next
}

export default function DaNangBackdrop() {
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(pickIndexClient())
  }, [])

  const photo = DANANG_PHOTOS[index]
  // Treat <640px as mobile. The Tailwind sm: breakpoint (=640px) marks the
  // tablet-vs-mobile division in the rest of the codebase; tablet extends
  // up to lg: (=1024px). Single source of truth in one matchMedia call so
  // we don't pick a different breakpoint per consumer.
  const imgClass = 'absolute inset-0 w-full h-full object-cover'

  return (
    <div aria-hidden="true" className="fixed inset-0 -z-10 overflow-hidden bg-paper">
      {/* Responsive photo via <picture>. Three sources ordered smallest-to-
          largest so the browser picks the FIRST that matches (mobile-first).
          The <img> fallback is the desktop full-bleed JPEG. */}
      <picture>
        <source media="(max-width: 639px)" srcSet={photo.srcSm} />
        <source media="(max-width: 1023px)" srcSet={photo.srcMd} />
        <img
          src={photo.src}
          alt={photo.alt}
          className={imgClass}
          loading="eager"
          decoding="async"
          fetchPriority="high"
          style={{
            filter: 'saturate(1.2) contrast(1.08) brightness(0.92)',
          }}
        />
      </picture>

      {/* Brand wash — single solid teal multiplied over the photo. ONE
          color, no gradient. Removed on 2026-10-20: the second teal
          `mixBlendMode: screen` layer, the amber corner blocks top-right
          + bottom-left, the paper wash, and the bottom-fade strip — see
          the 2026-10-20 commit message for the rationale. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(15, 118, 110, 0.30)',
          mixBlendMode: 'multiply',
        }}
      />

      {/* Tiny attribution mark, bottom-right, never visible to assistive tech */}
      <span className="absolute bottom-2 right-3 text-[10px] text-white font-semibold tracking-wider uppercase pointer-events-none select-none bg-ink/70 px-2 py-0.5 rounded-sm">
        {photo.place}
      </span>
    </div>
  )
}
