'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { ItineraryDay, ItineraryStop } from '@/lib/types'

/**
 * Subscribe to realtime changes on `itinerary_days` and
 * `itinerary_stops` for a single itinerary. The board re-renders
 * on every change so the user never sees a stale column.
 *
 * Filtering
 * ─────────
 * `itinerary_stops` is filtered by `itinerary_id` server-side.
 * `itinerary_days` is filtered the same way.
 *
 * Lifecycle
 * ─────────
 * The handler is stored in a ref so React's strict-mode double
 * mount does not detach the listener prematurely. The channel is
 * removed on unmount.
 */
export function useItineraryRealtime(
  itineraryId: string,
  onDay: (row: ItineraryDay, event: 'INSERT' | 'UPDATE' | 'DELETE') => void,
  onStop: (row: ItineraryStop, event: 'INSERT' | 'UPDATE' | 'DELETE') => void,
) {
  const dayRef = useRef(onDay)
  dayRef.current = onDay
  const stopRef = useRef(onStop)
  stopRef.current = onStop

  useEffect(() => {
    if (!itineraryId) return
    const sb = createClient()
    const channel = sb
      .channel(`itin-board:${itineraryId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'itinerary_days',
          filter: `itinerary_id=eq.${itineraryId}`,
        },
        (payload) => {
          const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          if (ev === 'DELETE') dayRef.current(payload.old as ItineraryDay, 'DELETE')
          else dayRef.current(payload.new as ItineraryDay, ev)
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'itinerary_stops',
          filter: `itinerary_id=eq.${itineraryId}`,
        },
        (payload) => {
          const ev = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          if (ev === 'DELETE') stopRef.current(payload.old as ItineraryStop, 'DELETE')
          else stopRef.current(payload.new as ItineraryStop, ev)
        },
      )
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }, [itineraryId])
}
