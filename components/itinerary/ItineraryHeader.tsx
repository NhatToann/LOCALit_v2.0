'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, Share2, Copy, Check, X } from 'lucide-react'

interface Props {
  tripShareToken: string | null
  dashboardHref: string
}

export default function ItineraryHeader({ tripShareToken, dashboardHref }: Props) {
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copyOk, setCopyOk] = useState(false)

  async function copyShareLink() {
    if (!tripShareToken) return
    const url = `${window.location.origin}/itinerary/share/${tripShareToken}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 2000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2">
      <Link
        href={dashboardHref}
        className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
      >
        <ArrowLeft size={14} aria-hidden="true" />
        Back
      </Link>
      {tripShareToken ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setShowShareMenu((s) => !s)}
            className="inline-flex items-center gap-1 h-8 px-3 text-sm rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
            aria-label="Share itinerary"
          >
            <Share2 size={13} aria-hidden="true" />
            Share
          </button>
          {showShareMenu ? (
            <div className="absolute right-0 top-full mt-1 z-20 w-72 p-3 bg-surface border border-border rounded-sm shadow-focus">
              <p className="text-xs text-muted mb-2">
                Anyone with this link can read (not edit) your itinerary.
              </p>
              <button
                type="button"
                onClick={copyShareLink}
                className="w-full inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-primary text-paper hover:bg-primary-hover"
              >
                {copyOk ? (
                  <>
                    <Check size={12} aria-hidden="true" /> Copied
                  </>
                ) : (
                  <>
                    <Copy size={12} aria-hidden="true" /> Copy public link
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => setShowShareMenu(false)}
                aria-label="Close share menu"
                className="absolute top-1 right-1 text-muted hover:text-ink p-1"
              >
                <X size={12} aria-hidden="true" />
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
