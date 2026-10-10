'use client'

/**
 * FocusMapLeaflet — the Focus Mode map.
 *
 * 2026-10-10 update: copy of the dashboard's map experience. The
 * parent (app/focus/[sessionId]/page.tsx) already calls
 * `useFocusAutoMedia`, which in turn calls `useLiveUserLocations` to
 * power the always-on mic flow. THIS COMPONENT MUST NOT call
 * `useLiveUserLocations` again — Supabase Realtime throws "cannot
 * add `postgres_changes` callbacks for … after `subscribe()`" if
 * two `useEffect`s try to bind the same channel.
 *
 * Instead, the parent passes `liveLocations` (and selfGranted /
 * selfDenied) down via props. The dashboard splits ownership the
 * same way: the page-level component owns the hook, the inner map
 * view just receives the data.
 *
 * The map renders the same way as the dashboard: local user marker,
 * buddy pins (Son Tra, Hai Van, etc.), and every other live tourist
 * currently broadcasting on the Da Nang map. The "Focus with" header
 * card and the "Sharing live / Location off / …" pill are added on
 * top to keep the user oriented to the session context.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import type { LiveLocation } from '@/hooks/useLiveUserLocations'
import type { Profile } from '@/lib/types'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DA_NANG_CENTER = { lat: 16.0544, lng: 108.2023 }

export interface LiveLocationState {
  selfGranted: boolean
  selfDenied: boolean
}

interface FocusMapLeafletProps {
  me: Profile | null
  partner: Profile | null
  /** When true, broadcast the user's location (mic-style toggle). */
  shareLocation: boolean
  /**
   * Self location state owned by the parent (useFocusAutoMedia
   * already wires geolocation for the always-on mic flow).
   */
  liveLocation: LiveLocationState
  /**
   * Other signed-in users sharing their live position. Sourced
   * from the parent's `useLiveUserLocations` hook so we never
   * double-subscribe the `da-nang-live-locations-pg` channel.
   */
  liveLocations: LiveLocation[]
  height?: number
}

export default function FocusMapLeaflet({
  me,
  partner,
  shareLocation,
  liveLocation,
  liveLocations,
  height = 360,
}: FocusMapLeafletProps) {
  // Own GPS fix for the "you are here" marker. Mirrors the
  // dashboard's pattern: navigator.geolocation.watchPosition sets
  // the visible user position even when `shareLocation` is off (so
  // the user can still see themselves on the map without
  // broadcasting).
  const [userLocation, setUserLocation] = useState(DA_NANG_CENTER)
  const [hasGpsFix, setHasGpsFix] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude })
        setHasGpsFix(true)
      },
      () => {
        setHasGpsFix(false)
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
    )
    return () => navigator.geolocation.clearWatch(id)
  }, [])

  // If sharing is paused but the partner has a recent live fix,
  // recenter on them. Same UX as the dashboard's "buddy nearby"
  // hint.
  useEffect(() => {
    if (shareLocation) return
    if (liveLocation.selfGranted) return
    let cancelled = false
    void (async () => {
      const partnerFix = await fetchPartnerFix(partner?.id ?? null)
      if (cancelled) return
      if (partnerFix) {
        setUserLocation(partnerFix)
        setHasGpsFix(true)
      } else {
        setUserLocation(DA_NANG_CENTER)
        setHasGpsFix(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [shareLocation, liveLocation.selfGranted, partner?.id])

  const selfLiveOverride = shareLocation && liveLocation.selfGranted

  return (
    <div
      className="relative"
      style={{ height }}
      role="region"
      aria-label="Focus map"
    >
      <MapView
        userLocation={userLocation}
        height="100%"
        hasGpsFix={hasGpsFix || selfLiveOverride}
        selfLiveOverride={selfLiveOverride}
        selfUserId={me?.id ?? null}
        liveLocations={liveLocations}
      />
      {/* "Focus with" overlay — matches the dashboard's header card
          pattern so the user always knows which session they're
          looking at. */}
      <div className="absolute top-3 left-3 z-10 bg-focus-surface border border-focus-border rounded-sm px-3 py-2 text-xs text-focus-text shadow-sm">
        <p className="text-[10px] uppercase tracking-wide text-focus-muted">
          Focus with
        </p>
        <p className="text-sm font-semibold text-focus-text">
          {partner?.full_name ?? 'Buddy'}
        </p>
      </div>
      {/* Share-status pill — same pattern as the dashboard's
          ShareStatusBadge, so the user gets a consistent "am I
          broadcasting?" answer regardless of which page they're on. */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-sm border ${
            selfLiveOverride
              ? 'bg-success-bg text-success border-success'
              : shareLocation && liveLocation.selfDenied
                ? 'bg-warning-bg text-warning border-warning'
                : 'bg-focus-surface text-focus-muted border-focus-border'
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              selfLiveOverride
                ? 'bg-success animate-pulse'
                : shareLocation && liveLocation.selfDenied
                  ? 'bg-warning'
                  : 'bg-focus-muted'
            }`}
            aria-hidden="true"
          />
          {selfLiveOverride
            ? 'Sharing live'
            : shareLocation && liveLocation.selfDenied
              ? 'Location off'
              : shareLocation
                ? 'Locating…'
                : 'Location paused'}
        </span>
      </div>
    </div>
  )
}

/**
 * fetchPartnerFix — look up the partner's most recent live location
 * row so the map can center on them when the user has paused their
 * own share. Returns null if the partner has never broadcast.
 */
async function fetchPartnerFix(
  partnerId: string | null,
): Promise<{ lat: number; lng: number } | null> {
  if (!partnerId) return null
  const supabase = createClient()
  const { data } = await supabase
    .from('location_updates')
    .select('latitude, longitude, updated_at')
    .eq('user_id', partnerId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!data) return null
  const age = Date.now() - new Date(data.updated_at).getTime()
  if (age > 60 * 60 * 1000) return null
  return { lat: Number(data.latitude), lng: Number(data.longitude) }
}
