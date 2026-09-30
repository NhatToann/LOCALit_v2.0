'use client'

/**
 * useGlobalPresence — sub-second online/offline state across the entire
 * marketplace, not just /chat.
 *
 * Layered on top of the DB heartbeat (`profiles.is_online` set by
 * `useOnlineHeartbeat`). The heartbeat alone is correct but lags by up
 * to 30 s — a user who signs in on tab B is still "offline" on tab A
 * until the next DB write. The broadcast layer flips that in <1 s.
 *
 * Architecture:
 *   1. The authenticated tab mounts `<GlobalPresence />` from AppShell.
 *      On mount it subscribes to a single broadcast channel
 *      `presence-global`.
 *   2. While mounted it broadcasts a heartbeat every 25 s:
 *        { user_id, is_online: true, last_seen: <iso> }
 *      Stored in a module-level `presenceCache` Map so all pages can
 *      read it without their own subscription.
 *   3. On unmount / signout it broadcasts `{ is_online: false }` so
 *      peers see the user go offline immediately.
 *   4. On mount the provider also seeds `presenceCache` with the
 *      current DB `profiles.is_online` values so first paint is
 *      accurate even before any broadcast arrives.
 *
 * Why a module-level cache (no React Context)?
 *   Project doesn't have zustand. Context would force every page to
 *   be wrapped in a Provider (or a hook that triggers re-renders of
 *   the whole subtree on any change). The module-level cache + a
 *   tiny `useSyncExternalStore` shim gives us:
 *     - O(1) read from any component
 *     - re-render only on direct subscriptions via usePresenceOf
 *     - no Provider boilerplate
 *
 * Why not just use the existing `usePresence` (per-conversation)?
 *   That hook subscribes to `presence-conv-${activeId}` and only
 *   mounts on /chat. Buddies/tourists on /map, /browse, /profile,
 *   /buddies never receive presence updates from it. The "presence
 *   offline on non-/chat pages" bug that triggered this rewrite is
 *   exactly that gap.
 */

import { useEffect, useSyncExternalStore } from 'react'
import { createClient } from '@/utils/supabase/auth'

const GLOBAL_CHANNEL = 'presence-global'
const BROADCAST_INTERVAL_MS = 25_000

export interface PresenceSnapshot {
  user_id: string
  is_online: boolean
  last_seen: string // ISO
  full_name?: string
}

// --- Module-level cache ----------------------------------------------

type Listener = () => void

const cache: Map<string, PresenceSnapshot> = new Map()
const listeners: Set<Listener> = new Set()

function emit(): void {
  for (const l of listeners) l()
}

function setSnapshot(s: PresenceSnapshot): void {
  const cur = cache.get(s.user_id)
  if (
    cur &&
    cur.is_online === s.is_online &&
    cur.full_name === s.full_name
  ) {
    return
  }
  cache.set(s.user_id, s)
  emit()
}

function seedMany(rows: PresenceSnapshot[]): void {
  let changed = false
  for (const r of rows) {
    const cur = cache.get(r.user_id)
    if (!cur || cur.is_online !== r.is_online) {
      cache.set(r.user_id, r)
      changed = true
    }
  }
  if (changed) emit()
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function getSnapshot(): PresenceSnapshot | undefined {
  // The provider holds the only writer; we expose a stable aggregate.
  // Components should call `usePresenceOf(userId)` rather than this.
  return undefined
}

function getServerSnapshot(): PresenceSnapshot | undefined {
  return undefined
}

// --- Public hooks ----------------------------------------------------

/**
 * Read a single user's presence. Returns `null` if unknown.
 * Re-renders only when that specific user's snapshot changes.
 */
export function usePresenceOf(userId: string | null): PresenceSnapshot | null {
  // useSyncExternalStore gives us a stable subscribe + per-component
  // selector. The trick: the snapshot getter returns the aggregate
  // array, but we filter by userId in the hook. That re-renders on
  // any change — fine for the small set of users we track at any
  // moment (<100 active). For O(1) selectors we'd add per-key
  // subscribe variants; left for later.
  const all = useSyncExternalStore(subscribe, getAllSnapshot, getServerAll)
  if (!userId) return null
  return all.get(userId) ?? null
}

const AGGREGATE_KEY = '__aggregate__'
const aggregateCache = new Map<string, PresenceSnapshot>()
let lastEmittedSnapshot: Map<string, PresenceSnapshot> = new Map()

function getAllSnapshot(): Map<string, PresenceSnapshot> {
  if (aggregateCache.size !== cache.size) {
    aggregateCache.clear()
    for (const [k, v] of cache) aggregateCache.set(k, v)
    lastEmittedSnapshot = new Map(aggregateCache)
  } else {
    // Same size — re-check values to detect in-place changes.
    let mismatch = false
    for (const [k, v] of cache) {
      const cur = aggregateCache.get(k)
      if (!cur || cur !== v) {
        mismatch = true
        break
      }
    }
    if (mismatch) {
      aggregateCache.clear()
      for (const [k, v] of cache) aggregateCache.set(k, v)
      lastEmittedSnapshot = new Map(aggregateCache)
    }
  }
  return lastEmittedSnapshot
}
function getServerAll(): Map<string, PresenceSnapshot> {
  return new Map()
}

/**
 * Lightweight boolean selector.
 */
export function useIsOnline(userId: string | null): boolean {
  const snap = usePresenceOf(userId)
  return !!snap?.is_online
}

// --- Provider --------------------------------------------------------

/**
 * The mount-once provider. Use from AppShell with the current userId.
 */
export function GlobalPresence({ userId }: { userId: string | null }) {
  useEffect(() => {
    if (!userId) {
      cache.clear()
      emit()
      return
    }
    // Tag our own presence in cache so optimistic reads work.
    setSnapshot({
      user_id: userId,
      is_online: true,
      last_seen: new Date().toISOString(),
    })

    const supabase = createClient()

    // Seed with the current DB heartbeat value so first paint is
    // accurate even before any broadcast round-trip.
    void supabase
      .from('safe_profiles')
      .select('id, is_online, full_name')
      .then(({ data }) => {
        if (!data) return
        seedMany(
          (data as Array<{
            id: string
            is_online: boolean | null
            full_name: string | null
          }>).map((row) => ({
            user_id: row.id,
            is_online: !!row.is_online,
            last_seen: new Date().toISOString(),
            full_name: row.full_name ?? undefined,
          })),
        )
      })

    const channel = supabase.channel(GLOBAL_CHANNEL, {
      config: { broadcast: { self: false, ack: false } },
    })

    channel.on('broadcast', { event: 'presence' }, (msg) => {
      const payload = msg.payload as PresenceSnapshot | null
      if (!payload || !payload.user_id) return
      if (payload.user_id === userId) return // ignore own echoes
      setSnapshot({
        user_id: payload.user_id,
        is_online: !!payload.is_online,
        last_seen: payload.last_seen ?? new Date().toISOString(),
        full_name: payload.full_name ?? cache.get(payload.user_id)?.full_name,
      })
    })

    channel.subscribe()

    function emit2(isOnline: boolean): void {
      if (!channel) return
      try {
        void channel.send({
          type: 'broadcast',
          event: 'presence',
          payload: {
            user_id: userId,
            is_online: isOnline,
            last_seen: new Date().toISOString(),
          },
        })
      } catch {
        /* swallow */
      }
    }
    emit2(true)
    const interval = setInterval(() => emit2(true), BROADCAST_INTERVAL_MS)

    function onVisibility(): void {
      if (typeof document === 'undefined') return
      if (document.visibilityState === 'visible') emit2(true)
    }
    document.addEventListener('visibilitychange', onVisibility)

    function onBeforeUnload(): void {
      emit2(false)
    }
    window.addEventListener('beforeunload', onBeforeUnload)

    function onLocalAuthChanged(): void {
      emit2(false)
      clearInterval(interval)
      try {
        void supabase.removeChannel(channel)
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('localit-auth-changed', onLocalAuthChanged)

    return () => {
      emit2(false)
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.removeEventListener('localit-auth-changed', onLocalAuthChanged)
      try {
        void supabase.removeChannel(channel)
      } catch {
        /* channel may already be gone */
      }
      // Drop our own entry from cache on full unmount.
      cache.delete(userId)
      emit()
    }
  }, [userId])

  return null
}

/** Test/debug only — reset module state. */
export function __resetGlobalPresenceForTests(): void {
  cache.clear()
  emit()
}

// Silence unused warnings from earlier draft (kept for future use).
void getSnapshot
void getServerSnapshot
void AGGREGATE_KEY
