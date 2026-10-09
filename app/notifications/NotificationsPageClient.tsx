'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  MessageCircle,
  UserPlus,
  Handshake,
  UserX,
  MapPin,
  MapPinPlus,
  CheckCheck,
  Loader2,
  Inbox,
  Trash2,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Notification, NotificationType } from '@/lib/types'
import { relativeTime } from '@/lib/notifications'

const ICONS: Record<NotificationType, React.ComponentType<{ size?: number; className?: string }>> = {
  message: MessageCircle,
  connection_request: UserPlus,
  connection_accepted: Handshake,
  connection_declined: UserX,
  trip_update: MapPin,
  focus_request: MapPinPlus,
  focus_accepted: MapPinPlus,
  focus_declined: MapPinPlus,
}

const TYPE_TONE: Record<NotificationType, string> = {
  message: 'bg-info-bg text-info',
  connection_request: 'bg-warning-bg text-warning',
  connection_accepted: 'bg-success-bg text-success',
  connection_declined: 'bg-danger-bg text-danger',
  trip_update: 'bg-primary-bg text-primary',
  focus_request: 'bg-focus-primary text-white',
  focus_accepted: 'bg-success-bg text-success',
  focus_declined: 'bg-danger-bg text-danger',
}

const TYPE_LABEL: Record<NotificationType, string> = {
  message: 'Message',
  connection_request: 'Connection request',
  connection_accepted: 'Connection accepted',
  connection_declined: 'Connection declined',
  trip_update: 'Trip update',
  focus_request: 'Focus request',
  focus_accepted: 'Focus accepted',
  focus_declined: 'Focus declined',
}

const FILTERS: Array<{ v: 'all' | NotificationType; label: string }> = [
  { v: 'all', label: 'All' },
  { v: 'message', label: 'Messages' },
  { v: 'connection_request', label: 'Requests' },
  { v: 'connection_accepted', label: 'Accepted' },
  { v: 'trip_update', label: 'Trips' },
]

interface Props {
  userId: string
  initialRows: Notification[]
}

export default function NotificationsPageClient({ userId, initialRows }: Props) {
  const router = useRouter()
  const [items, setItems] = useState<Notification[]>(initialRows)
  const [filter, setFilter] = useState<'all' | NotificationType>('all')
  const [showUnread, setShowUnread] = useState(false)
  const [marking, startMarking] = useTransition()
  const [deleting, startDeleting] = useTransition()

  const unread = items.filter((n) => !n.read_at).length

  // Realtime mirror of the dropdown bell
  useEffect(() => {
    const supabase = createClient()
    const channel = supabase
      .channel(`notif-page-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Notification
          setItems((prev) => [row, ...prev])
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Notification
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const oldId = (payload.old as { id?: string })?.id
          if (oldId) setItems((prev) => prev.filter((n) => n.id !== oldId))
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const visible = items
    .filter((n) => filter === 'all' || n.type === filter)
    .filter((n) => !showUnread || !n.read_at)

  async function markRead(id: string, link: string | null) {
    const supabase = createClient()
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)),
    )
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id)
    if (link) router.push(link)
  }

  function markAll() {
    if (unread === 0) return
    startMarking(async () => {
      const supabase = createClient()
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
      await supabase.from('notifications').update({ read_at: now }).eq('user_id', userId).is('read_at', null)
    })
  }

  function clearAll() {
    if (items.length === 0) return
    if (!window.confirm('Delete all notifications? This cannot be undone.')) return
    startDeleting(async () => {
      const supabase = createClient()
      setItems([])
      await supabase.from('notifications').delete().eq('user_id', userId)
    })
  }

  return (
    <div className="container-page py-8">
      <header className="mb-6 flex flex-wrap items-start gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-page-title inline-flex items-center gap-2">
            <Bell size={20} aria-hidden="true" /> Notifications
          </h1>
          <p className="text-sm text-muted mt-1">
            {unread > 0
              ? `${unread} unread of ${items.length} total`
              : `${items.length} notifications, all read`}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={markAll}
            disabled={marking || unread === 0}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {marking ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <CheckCheck size={13} aria-hidden="true" />}
            Mark all read
          </button>
          <button
            type="button"
            onClick={clearAll}
            disabled={deleting || items.length === 0}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-danger border border-border-strong hover:bg-danger-bg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {deleting ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Trash2 size={13} aria-hidden="true" />}
            Clear all
          </button>
        </div>
      </header>

      <fieldset className="border border-border rounded-sm bg-surface p-5 mb-6">
        <legend className="px-2 text-[11px] uppercase tracking-wide text-muted">Filters</legend>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.v}
              type="button"
              onClick={() => setFilter(f.v)}
              className={`inline-flex items-center h-8 px-3 text-xs font-medium rounded-sm border transition-colors ${
                filter === f.v
                  ? 'bg-primary text-paper border-primary'
                  : 'bg-transparent text-ink border-border-strong hover:bg-paper'
              }`}
              aria-pressed={filter === f.v}
            >
              {f.label}
            </button>
          ))}
          <label className="inline-flex items-center gap-2 ml-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={showUnread}
              onChange={(e) => setShowUnread(e.target.checked)}
              className="accent-primary"
            />
            Unread only
          </label>
        </div>
      </fieldset>

      {visible.length === 0 ? (
        <fieldset className="border border-dashed border-border rounded-sm bg-paper p-8 text-center">
          <Inbox size={28} className="mx-auto text-subtle mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-ink">No notifications match these filters.</p>
          <p className="text-xs text-muted mt-1">
            {items.length === 0
              ? 'New messages, connection requests, and trip updates will appear here.'
              : 'Try a different filter or uncheck "Unread only".'}
          </p>
        </fieldset>
      ) : (
        <fieldset className="border border-border rounded-sm bg-surface p-0">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted">Activity</legend>
          <ul role="list" className="divide-y divide-border">
            {visible.map((n) => {
              const Icon = ICONS[n.type]
              const tone = TYPE_TONE[n.type]
              const isUnread = !n.read_at
              return (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => markRead(n.id, n.link)}
                    className={`w-full text-left flex items-start gap-3 px-5 py-4 hover:bg-paper transition-colors ${
                      isUnread ? 'bg-paper' : ''
                    }`}
                    aria-label={`${n.title}. ${isUnread ? 'Unread' : 'Read'}`}
                  >
                    <span
                      className={`flex-shrink-0 inline-flex items-center justify-center w-10 h-10 rounded-sm ${tone}`}
                      aria-hidden="true"
                    >
                      <Icon size={16} aria-hidden="true" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="flex items-center gap-2 flex-wrap">
                        <span className={`text-xs px-2 py-0.5 rounded-sm ${tone} capitalize`}>
                          {TYPE_LABEL[n.type]}
                        </span>
                        <span className={`text-sm ${isUnread ? 'font-semibold text-ink' : 'font-medium text-ink'}`}>
                          {n.title}
                        </span>
                        <span className="text-[10px] text-subtle tabular-nums ml-auto">
                          {relativeTime(n.created_at)}
                        </span>
                      </span>
                      {n.body ? (
                        <p className={`text-sm mt-1 line-clamp-2 ${isUnread ? 'text-ink' : 'text-muted'}`}>
                          {n.body}
                        </p>
                      ) : null}
                      {n.actor_name ? (
                        <p className="text-[11px] text-subtle mt-1">from {n.actor_name}</p>
                      ) : null}
                    </span>
                    {isUnread ? (
                      <span
                        className="flex-shrink-0 inline-block w-2.5 h-2.5 rounded-full bg-primary mt-1.5"
                        aria-hidden="true"
                      />
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </fieldset>
      )}
    </div>
  )
}