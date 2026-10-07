'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import {
  Bell,
  MessageCircle,
  UserPlus,
  Handshake,
  UserX,
  MapPin,
  Check,
  CheckCheck,
  Loader2,
  Inbox,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Notification, NotificationType } from '@/lib/types'
import { relativeTime } from '@/lib/notifications'

const ICONS: Record<NotificationType, React.ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' | 'false'; className?: string }>> = {
  message: MessageCircle,
  connection_request: UserPlus,
  connection_accepted: Handshake,
  connection_declined: UserX,
  trip_update: MapPin,
}

const TYPE_TONE: Record<NotificationType, string> = {
  message: 'bg-info-bg text-info',
  connection_request: 'bg-warning-bg text-warning',
  connection_accepted: 'bg-success-bg text-success',
  connection_declined: 'bg-danger-bg text-danger',
  trip_update: 'bg-primary-bg text-primary',
}

interface Props {
  userId: string | undefined
  /** Pull from props if the parent already has a session id. */
  initialCount?: number
}

/**
 * NotificationBell — bell icon + unread badge + dropdown panel.
 *
 * • Subscribes to realtime on `notifications` for the current user
 *   so the badge updates the instant a new message arrives or a
 *   connection request lands.
 * • Renders the most recent 20 notifications in a dropdown panel.
 *   Each row is clickable: marks read + goes to the deep link.
 * • "Mark all as read" clears the badge in one click.
 *
 * Reads ONLY from public.notifications — the DB trigger fans events
 * out, so the client never subscribes to messages/connections directly.
 */
export default function NotificationBell({ userId, initialCount = 0 }: Props) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState<number>(initialCount)
  const [loading, setLoading] = useState(true)
  const [marking, startMarking] = useTransition()
  const panelRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)

  // Load + subscribe
  useEffect(() => {
    if (!userId) { setLoading(false); return }
    let cancelled = false
    const supabase = createClient()

    async function load() {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20)
      if (!cancelled) {
        if (!error && data) {
          setItems(data as Notification[])
          setUnread(data.filter((n: Notification) => !n.read_at).length)
        }
        setLoading(false)
      }
    }
    load()

    // Realtime — Postgres changes on rows where user_id matches
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Notification
          setItems((prev) => [row, ...prev].slice(0, 20))
          setUnread((u) => u + 1)
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
        (payload) => {
          const row = payload.new as Notification
          setItems((prev) => prev.map((n) => (n.id === row.id ? row : n)))
          if (row.read_at) setUnread((u) => Math.max(0, u - 1))
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [userId])

  // Click outside / Esc to close
  useEffect(() => {
    if (!open) return
    function onClick(e: MouseEvent) {
      if (
        panelRef.current && !panelRef.current.contains(e.target as Node) &&
        buttonRef.current && !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  async function markRead(id: string, link: string | null) {
    if (!userId) return
    const supabase = createClient()
    // optimistic update
    setItems((prev) =>
      prev.map((n) => (n.id === id && !n.read_at ? { ...n, read_at: new Date().toISOString() } : n)),
    )
    setUnread((u) => Math.max(0, u - 1))
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', id)
      .eq('user_id', userId)
    setOpen(false)
    if (link) router.push(link)
  }

  function markAllRead() {
    if (!userId || unread === 0) return
    startMarking(async () => {
      const supabase = createClient()
      const now = new Date().toISOString()
      setItems((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })))
      setUnread(0)
      await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', userId)
        .is('read_at', null)
    })
  }

  if (!userId) return null

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="relative p-2 rounded-sm transition-colors duration-150 hover:bg-paper focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        aria-label={unread > 0 ? `Notifications, ${unread} unread` : 'Notifications'}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls="notification-panel"
      >
        <Bell size={20} aria-hidden="true" />
        {unread > 0 ? (
          <span
            className="absolute top-0.5 right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-paper text-[10px] font-semibold tabular-nums"
            aria-hidden="true"
            style={{ lineHeight: 1 }}
          >
            {unread > 99 ? '99+' : unread}
          </span>
        ) : null}
      </button>

      {open && (
        <div
          ref={panelRef}
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 mt-2 w-[360px] max-w-[calc(100vw-2rem)] bg-[#FFFFFF] border border-border rounded-sm z-50"
          style={{ boxShadow: 'var(--shadow-focus)' }}
        >
          <header className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="text-sm font-semibold text-ink inline-flex items-center gap-2">
              <Bell size={14} aria-hidden="true" />
              Notifications
              {unread > 0 ? (
                <span className="badge badge-primary text-[10px] tabular-nums">{unread}</span>
              ) : null}
            </h2>
            <button
              type="button"
              onClick={markAllRead}
              disabled={marking || unread === 0}
              className="inline-flex items-center gap-1 text-xs text-muted hover:text-ink disabled:opacity-40 disabled:cursor-not-allowed"
              aria-label="Mark all notifications as read"
            >
              {marking ? <Loader2 size={12} className="animate-spin" aria-hidden="true" /> : <CheckCheck size={12} aria-hidden="true" />}
              Mark all read
            </button>
          </header>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="px-4 py-8 text-center text-xs text-muted">
                <Loader2 size={16} className="animate-spin mx-auto mb-2" aria-hidden="true" />
                Loading notifications…
              </div>
            ) : items.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-muted">
                <Inbox size={24} className="mx-auto mb-2 text-subtle" aria-hidden="true" />
                <p>No notifications yet.</p>
                <p className="mt-1">We&apos;ll ping you when someone messages you or wants to connect.</p>
              </div>
            ) : (
              <ul role="list" className="divide-y divide-border">
                {items.map((n) => {
                  const Icon = ICONS[n.type]
                  const tone = TYPE_TONE[n.type]
                  const isUnread = !n.read_at
                  return (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markRead(n.id, n.link)}
                        className={`w-full text-left flex items-start gap-3 px-4 py-3 hover:bg-paper transition-colors ${
                          isUnread ? 'bg-paper' : ''
                        }`}
                        aria-label={`${n.title}. ${isUnread ? 'Unread' : 'Read'}`}
                      >
                        <span
                          className={`flex-shrink-0 inline-flex items-center justify-center w-8 h-8 rounded-sm ${tone}`}
                          aria-hidden="true"
                        >
                          <Icon size={14} aria-hidden="true" />
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="flex items-baseline gap-2">
                            <span className={`text-sm leading-snug ${isUnread ? 'font-semibold text-ink' : 'font-medium text-muted'}`}>
                              {n.title}
                            </span>
                            <span className="text-[10px] text-subtle tabular-nums whitespace-nowrap">
                              {relativeTime(n.created_at)}
                            </span>
                          </span>
                          {n.body ? (
                            <span className={`block text-xs mt-0.5 line-clamp-2 ${isUnread ? 'text-ink' : 'text-muted'}`}>
                              {n.body}
                            </span>
                          ) : null}
                          {n.actor_name ? (
                            <span className="block text-[10px] text-subtle mt-1">
                              from {n.actor_name}
                            </span>
                          ) : null}
                        </span>
                        {isUnread ? (
                          <span
                            className="flex-shrink-0 inline-block w-2 h-2 rounded-full bg-primary mt-1.5"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <footer className="px-4 py-2 border-t border-border flex items-center justify-between text-xs">
            <span className="text-subtle">
              {items.length > 0 ? `Showing ${items.length} most recent` : ''}
            </span>
            <button
              type="button"
              onClick={() => { setOpen(false); router.push('/notifications') }}
              className="text-muted hover:text-ink inline-flex items-center gap-1"
            >
              View all
            </button>
          </footer>
        </div>
      )}
    </div>
  )
}