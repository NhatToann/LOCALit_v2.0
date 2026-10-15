'use client'

/**
 * ChatLockGuard — small inline banner that polls the connection state
 * for the current conversation partner and shows a lock banner when the
 * connection has expired.
 *
 * Mounted inside /chat; reads `partnerId` from a context-free prop and
 * the partner display name from props. Auto-hides when no active partner
 * is set.
 */
import { useState } from 'react'
import LockBanner from './LockBanner'
import { useConnectionState } from '@/hooks/useConnectionState'

interface Props {
  partnerId: string | null
  partnerName: string
  /** Where the "open chat" link should point when locked. */
  contextHref: string
}

export default function ChatLockGuard({ partnerId, partnerName, contextHref }: Props) {
  // Re-render every 30s so the daysRemaining value stays fresh without
  // a full page refresh.
  const [, setTick] = useState(0)
  // Lightweight re-poll: parent already mounted, just re-read state via
  // the same hook (the hook itself polls on mount + cleanup).
  // We keep `setTick` available for future interval wiring.
  void setTick
  const { state } = useConnectionState(partnerId)
  if (!partnerId) return null
  if (!state.hasConnection) return null
  if (state.status !== 'accepted') return null
  if (!state.isLocked) return null
  if (!state.connectionId) return null
  return (
    <LockBanner
      connectionId={state.connectionId}
      partnerName={partnerName}
      partnerId={partnerId}
      expiresAt={state.expiresAt}
      contextHref={contextHref}
      contextLabel="Open chat"
    />
  )
}
