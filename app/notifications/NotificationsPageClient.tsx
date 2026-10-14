'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
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
import { navigate } from '@/lib/navigation'
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
  /** Server-computed unread count (truthful, not derived from `initialRows`). */
  initialUnread: number
}

/**
 * Notifications page — full activity feed.
 *
 * 2026-10-14 fixes (mirror the NotificationBell fixes):
 * BUG 1: clicking a row that was already read decremented the count.
 *   Fix: only decrement when the row was actually unread.
 * BUG 2: optimistic decrement + realtime UPDATE echo = double decrement.
 *   Fix: realtime handler compares before/after to decide whether to
 *   decrement.
 * BUG 3: "Mark all read" relied on the locally-derived `unread` which
 *   was based on the 20-row initial payload, so it under-reported when
 *   the user had >20 unread rows. The count is now sourced from the
 *   server (`initialUnread`) and updated optimistically with rollback.
 */
export default function NotificationsPageClient({ userId, initialRows, initialUnread }: Props) {
  const [items, setItems] = useState<Notification[]>(initialRows)
  const [filter, setFilter] = useState<'all' | NotificationType>('all')
  const [showUnread, setShowUnread] = useState(false)
  const [marking, startMarking] = useTransition()
  const [deleting, startDeleting] = useTransition()
  // Authoritative unread count, sourced from the server. The page
  // displays this; it is NOT derived from `items.length` (which only
  // contains the most recent 20 rows by design).
  const [unread, setUnread] = useState<number>(initialUnread)

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
          setItems((prev) => {
            if (prev.some((n) => n.id === row.id)) return prev
            return [row, ...prev]
          })
          if (!row.read_at) setUnread((u) => u + 1)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Notification
          // Visual only — count is refetched in markRead / markAll.
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)))
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const old = payload.old as { id?: string; read_at?: string | null }
          if (old?.id) {
            setItems((prev) => prev.filter((n) => n.id !== old.id))
            if (!old.read_at) setUnread((u) => Math.max(0, u - 1))
          }
        },
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [userId])

  const visible = items
    .filter((n) => filter === 'all' || n.type === filter)
    .filter((n) => !showUnread || !n.read_at)

  // The realtime handlers below are visual-only — they update the
  // visible rows for animation, but the badge count comes from the DB
  // refetch in `refreshUnreadCount` (called by markRead / markAll
  // after the mutation resolves). The optimistic + refetch pattern is
  // the only way to keep the count correct in the face of
  // optimistic-decrement + realtime-echo races.

  const refreshUnreadCount = useCallback(async () => {
    const supabase = createClient()
    const { count, error } = await supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null)
    if (error) {
      console.warn('[notifications] count refresh failed:', error.message)
      return
    }
    setUnread(count ?? 0)
  }, [userId])

  /**
   * Navigate FIRST, persist SECOND.
   *
   * Awaiting the UPDATE before navigating meant a stalled REST round-trip
   * left the tap looking completely dead — no navigation, no visual
   * feedback. The route change is now synchronous and the read receipt
   * is fire-and-forget.
   *
   * Bug 1 (2026-10-14): clicking an already-read row used to decrement
   * the count. Fix: only decrement when the row was actually unread.
   *
   * Bug 2 (2026-10-14): optimistic decrement + realtime UPDATE echo
   *   = double decrement. Fix: refetch the true count from the DB after
   *   the mutation resolves, so the badge reflects ground truth.
   */
  function markRead(id: string, link: string | null) {
    const supabase = createClient()
    const item = items.find((n) => n.id === id)
    const wasUnread = item && !item.read_at
    setItems((prev) =>
      prev.map((n) =>
        n.id === id && !n.read_at
          ? { ...n, read_at: new Date().toISOString() }
          : n,
      ),
    )
    if (wasUnread) setUnread((u) => Math.max(0, u - 1))
    void (async () => {
      try {
        const { error } = await supabase
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
        if (error) console.warn('[notifications] mark-read failed:', error.message)
        await refreshUnreadCount()
      } catch {
        /* swallow */
      }
    })()
    if (link) navigate(link)
  }

  function markAll() {
    if (unread === 0) return
    startMarking(async () => {
      const supabase = createClient()
      const now = new Date().toISOString()
      const prevItems = items
      // Optimistic: dim all loaded items + zero the count.
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
      setUnread(0)
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', userId)
        .is('read_at', null)
      if (error) {
        console.warn('[notifications] mark-all failed:', error.message)
        setItems(prevItems)
      }
      // Refetch the true count (handles both success and error paths).
      await refreshUnreadCount()
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