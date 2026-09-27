/**
 * Connection 3-stage flow helpers.
 *
 * Per product spec (2026-09-27):
 *   Stage 1 = SEARCH     (tourist found buddy, sent request — status: pending)
 *   Stage 2 = ACTIVE     (buddy accepted, both connected, on trip — status: accepted + active trip)
 *   Stage 3 = ENDED      (trip finished, awaiting review — status: completed)
 *
 * Each stage has a distinct badge color + label so users can see at a glance
 * where they stand with the other party.
 *
 * Connections expire after 3 days; both roles must verify (free) to extend.
 */

export type ConnectionStage = 'search' | 'active' | 'ended'

export interface ConnectionStageInfo {
  stage: ConnectionStage
  label: string
  description: string
  tone: 'warning' | 'success' | 'info'
  icon: 'search' | 'compass' | 'check'
}

/**
 * Derive the current stage from a connection row + (optional) trip row.
 * Pure function — server-rendered badges won't flicker.
 */
export function getConnectionStage(
  status: 'pending' | 'accepted' | 'declined',
  tripStatus?: 'planning' | 'confirmed' | 'completed' | 'cancelled' | null,
): ConnectionStageInfo {
  if (status === 'pending') {
    return {
      stage: 'search',
      label: 'Stage 1 — Searching',
      description: 'Waiting for the buddy to accept your request.',
      tone: 'warning',
      icon: 'search',
    }
  }
  if (status === 'declined') {
    return {
      stage: 'ended',
      label: 'Ended',
      description: 'This request was declined.',
      tone: 'info',
      icon: 'check',
    }
  }
  // accepted
  if (tripStatus === 'completed' || tripStatus === 'cancelled') {
    return {
      stage: 'ended',
      label: 'Stage 3 — Trip ended',
      description: 'Trip is complete. Leave a review for your buddy.',
      tone: 'info',
      icon: 'check',
    }
  }
  return {
    stage: 'active',
    label: 'Stage 2 — Together',
    description: 'You are connected. Plan your trip and explore Da Nang.',
    tone: 'success',
    icon: 'compass',
  }
}

/**
 * 3-day connection expiry: a connection created/accepted > 3 days ago
 * needs verification from BOTH parties to renew (free of charge).
 *
 * Returns days remaining (negative = expired).
 */
export function daysUntilExpiry(updatedAt: string): number {
  const updated = new Date(updatedAt).getTime()
  const now = Date.now()
  const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000
  return Math.ceil((updated + THREE_DAYS_MS - now) / (24 * 60 * 60 * 1000))
}

/**
 * Human label for expiry state.
 */
export function expiryLabel(daysLeft: number): string {
  if (daysLeft <= 0) return 'Expired — renew now'
  if (daysLeft === 1) return '1 day left to renew'
  return `${daysLeft} days left to renew`
}
