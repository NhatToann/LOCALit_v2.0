'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'

export interface PinDragPayload {
  stopId: string
  lat: number
  lng: number
  byUserId: string
  byName: string
  ts: number
}

interface Args {
  tripId: string | null
  me: { id: string; fullName: string } | null
  onRemoteDrag: (p: PinDragPayload) => void
}

/**
 * usePinDragBroadcast — Supabase Realtime broadcast channel for live
 * pin drags. Throttled client-side (caller's responsibility): send at
 * most every 50ms. The receiver should `setState` on a `draggingBy`
 * map; commits are still LWW via the DB write.
 */
export function usePinDragBroadcast({ tripId, me, onRemoteDrag }: Args) {
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)
  const onRemoteRef = useRef(onRemoteDrag)
  onRemoteRef.current = onRemoteDrag

  useEffect(() => {
    if (!tripId || !me) return
    const supabase = createClient()
    const channel = supabase.channel(`trip-pindrag-${tripId}`, {
      config: { broadcast: { self: false, ack: false } },
    })
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'pin-drag' }, (msg) => {
        const p = msg.payload as PinDragPayload | undefined
        if (!p || !p.stopId) return
        if (p.byUserId === me.id) return // ignore own echo
        onRemoteRef.current(p)
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [tripId, me?.id])

  function sendDrag(payload: Omit<PinDragPayload, 'byUserId' | 'byName' | 'ts'>) {
    if (!channelRef.current || !me) return
    channelRef.current.send({
      type: 'broadcast',
      event: 'pin-drag',
      payload: {
        ...payload,
        byUserId: me.id,
        byName: me.fullName,
        ts: Date.now(),
      },
    })
  }

  return { sendDrag }
}
