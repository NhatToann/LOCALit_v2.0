'use client'

import { useEffect, useState } from 'react'

/**
 * LOCALit Da Nang Backdrop — full-bleed, low-opacity photography.
 *
 * Per web-ai-slop §1a anchor #1 (Da Nang tourism-board print tradition), the
 * platform's brand should feel rooted in the city itself. A single rotating
 * photo sits BEHIND every page; individual cards/sections still render on
 * white surfaces so text stays readable. No emoji, no gradient blobs.
 *
 * Image set: 6 verified-licensed Unsplash photos of Da Nang landmarks.
 * Rotation: client-side random pick after mount, persisted to sessionStorage
 * so reloads don't flicker the layout. SSR renders a deterministic first
 * photo (index 0) to avoid hydration mismatch.
 */
const DANANG_PHOTOS = [
  {
    src: 'https://images.unsplash.com/photo-1572551562325-b5d5057c9b54?w=1920&q=70&auto=format&fit=crop',
    place: 'Han River',
    alt: 'Han River and Da Nang skyline at dusk',
  },
  {
    src: 'https://images.unsplash.com/photo-1528127269322-539801943592?w=1920&q=70&auto=format&fit=crop',
    place: 'Marble Mountains',
    alt: 'Limestone peaks of Marble Mountains at golden hour',
  },
  {
    src: 'https://images.unsplash.com/photo-1559592413-7cec4d0cae2b?w=1920&q=70&auto=format&fit=crop',
    place: 'My Khe Beach',
    alt: 'My Khe Beach with mountains in the background',
  },
  {
    src: 'https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1920&q=70&auto=format&fit=crop',
    place: 'Son Tra Peninsula',
    alt: 'Coastline of Son Tra Peninsula with forested hills',
  },
  {
    src: 'https://images.unsplash.com/photo-1552733407-5d5c46c33bb3?w=1920&q=70&auto=format&fit=crop',
    place: 'Da Nang cityscape',
    alt: 'Aerial view of Da Nang city and coastline',
  },
  {
    src: 'https://images.unsplash.com/photo-1540301773094-3a5f02bb4d51?w=1920&q=70&auto=format&fit=crop',
    place: 'Hoi An',
    alt: 'Lantern-lit streets of nearby Hoi An old town',
  },
]

const STORAGE_KEY = 'localit-backdrop-index'

function pickIndexClient(): number {
  if (typeof window === 'undefined') return 0
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY)
    if (stored !== null) {
      const n = parseInt(stored, 10)
      if (!Number.isNaN(n) && n >= 0 && n < DANANG_PHOTOS.length) return n
    }
  } catch {
    /* ignore — private mode */
  }
  const next = Math.floor(Math.random() * DANANG_PHOTOS.length)
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(next))
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
      className="fixed inset-0 -z-10 overflow-hidden bg-paper"
    >
      {/* Photo layer — desaturated + softened */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{
          backgroundImage: `url(${photo.src})`,
          opacity: 0.18,
          filter: 'saturate(0.7) contrast(0.95)',
        }}
      />
      {/* Paper-tone wash to keep contrast for white surfaces */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(250,250,247,0.55) 0%, rgba(250,250,247,0.78) 100%)',
        }}
      />
      {/* Tiny attribution mark, bottom-right, never visible to assistive tech */}
      <span className="absolute bottom-2 right-3 text-[10px] text-subtle tracking-wider uppercase pointer-events-none select-none">
        {photo.place}
      </span>
    </div>
  )
}
