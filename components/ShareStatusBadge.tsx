// ShareStatusBadge — shows the live location sharing status to the user.
// Rendered inside the featured map header on the tourist dashboard.

interface ShareStatusBadgeProps {
  granted: boolean
  denied: boolean
  hasFix: boolean
}

export function ShareStatusBadge({ granted, denied, hasFix }: ShareStatusBadgeProps) {
  if (granted) {
    return (
      <span className="share-status-badge share-status-granted">
        <span className="share-status-dot" aria-hidden="true" />
        Sharing live
      </span>
    )
  }
  if (denied) {
    return (
      <span className="share-status-badge share-status-denied">
        Location off
      </span>
    )
  }
  return (
    <span className="share-status-badge share-status-locating">
      {hasFix ? 'Locating…' : 'Locating…'}
    </span>
  )
}
