'use client'

/**
 * ConnectionsLive — invisible client island mounted at the top of
 * /connections. Subscribes to public.connections via Realtime and
 * calls `router.refresh()` whenever a row the current user
 * participates in changes. This is the cheap way to make the
 * otherwise-stale server component re-fetch its data after the
 * partner accepts / rejects / renews / cancels.
 *
 * Renders nothing (the section element with `aria-hidden` is purely
 * a debug anchor; remove if it ever shows up in screenshots).
 */
import { useRouter } from 'next/navigation'
import { useConnectionsRealtime } from '@/hooks/useConnectionsRealtime'

export default function ConnectionsLive() {
  const router = useRouter()
  useConnectionsRealtime(() => {
    router.refresh()
  })
  return <div aria-hidden="true" hidden />
}
