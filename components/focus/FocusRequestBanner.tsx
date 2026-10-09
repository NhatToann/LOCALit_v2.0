'use client'

import { useEffect, useState } from 'react'
import { Loader2, MapPinPlus, X } from 'lucide-react'
import type { FocusRequest, Profile } from '@/lib/types'

interface FocusRequestBannerProps {
  variant: 'incoming' | 'outgoing'
  request: FocusRequest
  partner: Profile | { id: string; full_name: string; avatar_url?: string | null } | null
  onAccept?: () => Promise<void> | void
  onDecline?: () => Promise<void> | void
  onCancel?: () => Promise<void> | void
  busy?: boolean
}

function formatRemaining(ms: number): string {
  if (ms <= 0) return 'expired'
  const totalSec = Math.floor(ms / 1000)
  const mm = Math.floor(totalSec / 60)
  const ss = totalSec % 60
  return `${mm}:${ss.toString().padStart(2, '0')}`
}

export default function FocusRequestBanner({
  variant,
  request,
  partner,
  onAccept,
  onDecline,
  onCancel,
  busy = false,
}: FocusRequestBannerProps) {
  const [now, setNow] = useState<number>(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [])
  const remainingMs = new Date(request.expires_at).getTime() - now
  const timeRemaining = formatRemaining(remainingMs)
  const partnerName = partner?.full_name ?? 'your buddy'

  if (variant === 'incoming') {
    return (
      <div
        role="status"
        className="border border-focus-primary bg-focus-surface rounded-sm p-3 mb-3"
      >
        <div className="flex items-center gap-2 mb-2">
          <MapPinPlus size={16} className="text-focus-primary" aria-hidden="true" />
          <p className="text-sm font-semibold text-focus-text">
            Focus request from {partnerName}
          </p>
        </div>
        <p className="text-xs text-focus-muted mb-3">
          They want to share a live trip. <span className="tabular-nums">{timeRemaining}</span>{' '}
          remaining.
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onAccept?.()}
            disabled={busy || remainingMs <= 0}
            className="flex-1 h-9 px-3 text-sm font-medium rounded-sm bg-focus-primary text-white border border-focus-primary hover:bg-focus-primary-dark disabled:opacity-50"
          >
            {busy ? 'Joining…' : 'Accept'}
          </button>
          <button
            type="button"
            onClick={() => onDecline?.()}
            disabled={busy}
            className="flex-1 h-9 px-3 text-sm font-medium rounded-sm bg-focus-surface text-focus-text border border-focus-border hover:bg-focus-border disabled:opacity-50"
          >
            Decline
          </button>
        </div>
      </div>
    )
  }

  // outgoing / waiting
  return (
    <div
      role="status"
      className="border border-focus-medium bg-focus-surface rounded-sm p-3 mb-3"
    >
      <div className="flex items-center gap-2 mb-2">
        <Loader2
          size={16}
          className="text-focus-medium animate-spin"
          aria-hidden="true"
        />
        <p className="text-sm font-semibold text-focus-text">
          Waiting for {partnerName}…
        </p>
      </div>
      <p className="text-xs text-focus-muted mb-3">
        Request expires in <span className="tabular-nums">{timeRemaining}</span>
      </p>
      <button
        type="button"
        onClick={() => onCancel?.()}
        disabled={busy}
        className="w-full h-9 px-3 text-sm font-medium rounded-sm bg-focus-surface text-focus-darkest border border-focus-border hover:bg-focus-border disabled:opacity-50 inline-flex items-center justify-center gap-1"
      >
        <X size={14} aria-hidden="true" />
        {busy ? 'Cancelling…' : 'Cancel request'}
      </button>
    </div>
  )
}
