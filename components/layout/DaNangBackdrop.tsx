'use client'

import { useEffect, useState } from 'react'

/**
 * LOCALit Da Nang Backdrop — full-bleed photography, transparent surfaces
 *
 * Per web-ai-slop §1a anchor #1 (Da Nang tourism-board print tradition), the
 * platform's brand should feel rooted in the city itself. A single rotating
 * photo sits BEHIND every page; individual content boxes use
 * `.surface-transparent` so the photo shows through and the page reads as one
 * continuous Da Nang canvas rather than white-paper with colored accents.
 *
 * Image set: 9 verified-licensed Unsplash photos of Da Nang landmarks. The
 * rotation is keyword-aware: every photo is tagged with a Da Nang area
 * (Bà Nà Hills, Mỹ Khê, Hội An, Sơn Trà, etc.) and the picker cycles through
 * the area list once before repeating. This ensures a tourist who reloads
 * sees a different landmark rather than re-seeing Han River 4× in a row.
 *
 * 4-color overlay: a low-opacity 4-role gradient (Tourist → Buddy → Info →
 * Hot) is layered on top of the photo so the brand identity shows even when
 * the photo is desaturated, and so the 4 colors are visible somewhere on
 * every page (per the design constraint).
 */
const DANANG_PHOTOS: Array<{ src: string; place: string; alt: string; keyword: string }> = [
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
    // Force a new photo at most every 30 minutes — that way a tourist who
    // browses 5 pages in a row sees the SAME landmark, then it changes.
    if (stored !== null && Date.now() - lastTs < 30 * 60 * 1000) {
      const n = parseInt(stored, 10)
      if (!Number.isNaN(n) && n >= 0 && n < DANANG_PHOTOS.length) return n
    }
  } catch {
    /* ignore — private mode */
  }
  // Pick a different index than the last one to avoid a no-op swap.
  let next = 0
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      const prev = parseInt(stored, 10)
      if (!Number.isNaN(prev)) {
        // Cycle forward through the keyword list, wrapping around.
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
  // SSR uses index 0 to avoid hydration mismatch; client picks the real photo after mount.
  const [index, setIndex] = useState(0)

  useEffect(() => {
    setIndex(pickIndexClient())
  }, [])

  const photo = DANANG_PHOTOS[index]

  return (
    <div
      aria-hidden="true"
      className="fixed inset-0 -z-10 overflow-hidden"
    >
      {/* Photo layer — full opacity so the Da Nang landmark is the page's
          visual anchor. Slight saturation/contrast boost so the 4-color
          wash on top still reads as 4 distinct colors. */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${photo.src})`,
          opacity: 1,
          filter: 'saturate(1.2) contrast(1.08) brightness(0.92)',
        }}
      />
      {/* 4-color brand wash — the 4-role gradient at HIGH opacity (40-50%)
          so every page visibly carries all 4 brand colors. Each color stop
          is mixed at 50% so the photo still shows through underneath. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(13,148,136,0.55) 0%, rgba(245,158,11,0.45) 33%, rgba(37,99,235,0.45) 66%, rgba(251,113,133,0.55) 100%)',
          mixBlendMode: 'multiply',
        }}
      />
      {/* 4-color gradient overlay #2 — same stops but additive (screen) so
          the brand colors pop without losing the photo detail. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:
            'linear-gradient(135deg, rgba(13,148,136,0.35) 0%, rgba(245,158,11,0.30) 33%, rgba(37,99,235,0.30) 66%, rgba(251,113,133,0.35) 100%)',
          mixBlendMode: 'screen',
        }}
      />
      {/* Light paper wash so white surface cards stay readable. Reduced to
          15% so the 4-color wash + photo stay vivid. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundColor: 'rgba(240, 253, 244, 0.15)',
        }}
      />
      {/* Bottom-fade so footer reads on a darker strip without a hard edge */}
      <div
        className="absolute inset-x-0 bottom-0 h-32"
        style={{
          background: 'linear-gradient(to bottom, transparent 0%, rgba(240,253,244,0.35) 100%)',
        }}
      />
      {/* Tiny attribution mark, bottom-right, never visible to assistive tech */}
      <span className="absolute bottom-2 right-3 text-[10px] text-white font-semibold tracking-wider uppercase pointer-events-none select-none bg-ink/70 px-2 py-0.5 rounded-sm">
        {photo.place}
      </span>
    </div>
  )
}
