'use client'

/**
 * GlobalConnectionRefresher — invisible client island mounted in
 * AppShell. Subscribes to public.connections via Realtime and calls
 * `router.refresh()` whenever a row the current user participates in
 * changes.
 *
 * Why this lives in AppShell and not just /connections:
 *   The user can be on /dashboard, /buddies/[id], /chat, or any other
 *   page when their partner accepts / rejects / renews / cancels. The
 *   only way to surface the new connection state across ALL those
 *   server-component-rendered surfaces is a single global subscription
 *   that re-runs the server data fetch on every change.
 *
 *   /connections also mounts its own ConnectionsLive — that's fine,
 *   useConnectionsRealtime dedupes per-userId at the channel level so
 *   two callers share the same Supabase channel and the same event
 *   fires router.refresh() on both consumers. router.refresh() is
 *   idempotent on a no-op server data change.
 *
 * Render: returns null. No DOM impact.
 */
import { useRouter } from 'next/navigation'
import { useConnectionsRealtime } from '@/hooks/useConnectionsRealtime'

export default function GlobalConnectionRefresher() {
  const router = useRouter()
  useConnectionsRealtime(() => {
    router.refresh()
  })
  return null
}
