'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'

/**
 * LikesBadge — shows a small pill with the count of incoming "likes"
 * for the current buddy. Polls /api/swipe/likes once on mount and then
 * subscribes to public.swipes for live updates. Renders nothing for
 * tourists (the API returns 403 and we hide the badge).
 *
 * Implementation note: Header renders this badge twice (desktop + mobile
 * nav), and the mobile drawer toggle was causing the realtime channel to
 * be torn down + recreated, which raced with Supabase's "no .on() after
 * .subscribe()" rule and produced:
 *   "Cannot add 'postgres_changes' callbacks for
 *    realtime:likes-badge-<id> after 'subscribe()'"
 *
 * To avoid that we share a single Supabase channel per userId at module
 * scope via a refcounted subscription. Each <LikesBadge userId={u}/>
 * increments, decrements on unmount, and only the first mount calls
 * .subscribe(); the last unmount calls removeChannel().
 */
type Subscriber = (value: number) => void

// Keyed by userId. Each entry holds the Supabase channel and the set of
// React components listening for count changes.
type ChannelEntry = {
  channel: ReturnType<ReturnType<typeof createClient>['channel']>
  subscribers: Set<Subscriber>
  refCount: number
  currentCount: number
  subscribed: boolean
}

const channels = new Map<string, ChannelEntry>()

function ensureChannel(userId: string): ChannelEntry {
  const existing = channels.get(userId)
  if (existing) return existing

  const supabase = createClient()
  // Note the random suffix — even if two ensureChannel calls race in the
  // same tick we get distinct channel names so the second channel is
  // never the same Realtime channel as the first.
  const channelName = `likes-badge-${userId}-${Math.random().toString(36).slice(2, 8)}`
  const channel = supabase.channel(channelName).on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'swipes' },
    (payload) => {
      const row = payload.new as {
        swiper_role: string
        target_id: string
        direction: string
      }
      if (row.direction !== 'like' || row.swiper_role !== 'tourist') return
      if (row.target_id !== userId) return
      const entry = channels.get(userId)
      if (!entry) return
      entry.currentCount += 1
      for (const fn of entry.subscribers) fn(entry.currentCount)
    },
  )

  const entry: ChannelEntry = {
    channel,
    subscribers: new Set(),
    refCount: 0,
    currentCount: 0,
    subscribed: false,
  }
  channels.set(userId, entry)
  return entry
}

export function LikesBadge({ userId }: { userId: string }) {
  const [count, setCount] = useState(0)

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    void (async () => {
      try {
        const res = await fetch('/api/swipe/likes', { cache: 'no-store' })
        if (!res.ok) return // 403 for tourists, ignore
        const data = await res.json()
        if (cancelled) return
        const initial = Array.isArray(data.likes) ? data.likes.length : 0
        setCount(initial)
        const entry = channels.get(userId)
        if (entry) entry.currentCount = initial
      } catch {
        /* ignore */
      }
    })()
    return () => {
      cancelled = true
    }
  }, [userId])

  useEffect(() => {
    if (!userId) return
    const entry = ensureChannel(userId)

    const subscriber: Subscriber = (v) => setCount(v)
    entry.subscribers.add(subscriber)
    setCount(entry.currentCount)
    entry.refCount += 1

    if (!entry.subscribed) {
      // Subscribe exactly once per userId, before any subscriber is added.
      // Subsequent .on() calls are forbidden by Supabase Realtime, which is
      // why we registered the handler inside ensureChannel().
      entry.channel.subscribe()
      entry.subscribed = true
    }

    return () => {
      const e = channels.get(userId)
      if (!e) return
      e.subscribers.delete(subscriber)
      e.refCount -= 1
      if (e.refCount <= 0) {
        // Last listener gone — fully detach. Awaiting the Promise avoids a
        // race where a sibling <LikesBadge> remounts while the channel is
        // still considered subscribed.
        void e.channel.unsubscribe().then(() => {
          const supabase = createClient()
          void supabase.removeChannel(e.channel).then(() => {
            channels.delete(userId)
          })
        })
      }
    }
  }, [userId])

  if (count <= 0) return null
  return (
    <span
      className="ml-1 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 text-[10px] font-semibold rounded-full bg-primary text-paper"
      aria-label={`${count} pending ${count === 1 ? 'like' : 'likes'}`}
    >
      {count > 9 ? '9+' : count}
    </span>
  )
}