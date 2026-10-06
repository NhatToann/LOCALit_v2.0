import type { Notification, NotificationType } from '@/lib/types'

export interface NotificationListItem extends Notification {}

export const NOTIFICATION_ICON: Record<NotificationType, string> = {
  message: 'message-circle',
  connection_request: 'user-plus',
  connection_accepted: 'handshake',
  connection_declined: 'user-x',
  trip_update: 'map-pin',
}

export const NOTIFICATION_LABEL: Record<NotificationType, string> = {
  message: 'Message',
  connection_request: 'Connection request',
  connection_accepted: 'Connection accepted',
  connection_declined: 'Connection declined',
  trip_update: 'Trip update',
}

export function relativeTime(iso: string): string {
  const now = Date.now()
  const then = new Date(iso).getTime()
  const diff = Math.max(0, now - then)
  const min = 60_000
  const hr = 60 * min
  const day = 24 * hr
  if (diff < min) return 'just now'
  if (diff < hr) return `${Math.floor(diff / min)}m ago`
  if (diff < day) return `${Math.floor(diff / hr)}h ago`
  if (diff < 7 * day) return `${Math.floor(diff / day)}d ago`
  return new Date(iso).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })
}