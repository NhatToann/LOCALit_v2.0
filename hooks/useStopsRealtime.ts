'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { ItineraryStop } from '@/lib/types'

/**
 * Subscribe to realtime updates on `itinerary_stops` for a single day.
 *
 * • INSERT / UPDATE / DELETE → onChange(row, event)
 * • Filtered server-side via `day_id=eq.<id>` so other days' edits
 *   don't wake the channel.
 * • On unmount, removes the channel and detaches the listener.
 *
 * Returns the unsubscribe function via a stable ref so React strict
 * mode double-mount doesn't leak channels.
 */
export function useStopsRealtime(
  dayId: string,
  onChange: (row: ItineraryStop, event: 'INSERT' | 'UPDATE' | 'DELETE') => void,
) {
  const handlerRef = useRef(onChange)
  handlerRef.current = onChange

  useEffect(() => {
    if (!dayId) return
    const sb = createClient()
    const channel = sb
      .channel(`itinerary-stops:${dayId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'itinerary_stops',
          filter: `day_id=eq.${dayId}`,
        },
        (payload) => {
          const eventName = payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE'
          if (eventName === 'DELETE') {
            // For DELETE, payload.old is the deleted row.
            handlerRef.current(payload.old as ItineraryStop, 'DELETE')
          } else {
            handlerRef.current(payload.new as ItineraryStop, eventName)
          }
        },
      )
      .subscribe()
    return () => {
      sb.removeChannel(channel)
    }
  }, [dayId])
}