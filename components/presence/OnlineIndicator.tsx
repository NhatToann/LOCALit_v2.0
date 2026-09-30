'use client'

/**
 * OnlineIndicator — renders the "Active now" badge using the global
 * presence cache. Updates within ~1 s of the partner flipping state
 * (instead of waiting for the next page load to read the DB).
 *
 * Renders `null` when the partner is offline so the surrounding
 * layout doesn't shift.
 */

import { useIsOnline } from '@/lib/realtime/useGlobalPresence'

export default function OnlineIndicator({
  userId,
  className = '',
}: {
  userId: string
  className?: string
}) {
  const isOnline = useIsOnline(userId)
  if (!isOnline) return null
  return (
    <p className={className}>
      <span className="badge badge-success">
        <span
          className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
          aria-hidden="true"
        />
        Active now
      </span>
    </p>
  )
}
