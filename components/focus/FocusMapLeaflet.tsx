'use client'

/**
 * FocusMapLeaflet — the Focus Mode map.
 *
 * 2026-10-10 update: copy of the dashboard's map experience. Uses the
 * shared `useLiveUserLocations` hook so both focus participants and
 * any other tourists broadcasting on the Da Nang map appear as live
 * markers. The dashboard does the same; this brings focus to parity
 * so the user sees the full "who's in Da Nang right now" overlay
 * (per the user's request 2026-10-10).
 *
 * The page-level parent (app/focus/[sessionId]/page.tsx) calls
 * `useFocusAutoMedia` for the mic and any pre-focus presence
 * concerns; this component owns the location-sharing subscription
 * (mirroring the dashboard's design). The hook returns
 * `liveLocations` for other sharers' positions and `selfGranted`/
 * `selfDenied` for the local user's GPS state — both are passed
 * straight through to <MapView />.
 *
 * Why a separate hook call here (and not in the parent):
 *   - The hook's `enabled` flag is wired to `shareLocation`, which
 *     the parent owns via a stateful toggle in the header. If the
 *     parent owned the hook, the toggle UI would have to be lifted
 *     out of the header into a context.
 *   - The dashboard uses the same split (parent renders the toggle,
 *     page-level `useLiveUserLocations`).
 *   - Supabase's Realtime channel `da-nang-live-locations-pg` is
 *     created exactly once per call to `.subscribe()`. The hook
 *     owns its own subscription lifecycle and tears down on unmount,
 *     so two simultaneous FocusMode tabs each get their own channel
 *     without the double-subscribe problem the old design had.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'
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
   * Self location state owned by the parent (e.g. useFocusAutoMedia
   * already wires geolocation for the mic flow). When the parent
   * has a real GPS fix the dashboard pattern uses that as the
   * fallback, otherwise the focus map's own `useLiveUserLocations`
   * hook is the source of truth. Either way the dashboard parity
   * is preserved.
   */
  liveLocation: LiveLocationState
  height?: number
}

export default function FocusMapLeaflet({
  me,
  partner,
  shareLocation,
  liveLocation,
  height = 360,
}: FocusMapLeafletProps) {
  // Use the same hook the dashboard uses so the focus map shows
  // every other live tourist + every static buddy pin (the
  // latter is rendered by MapView itself via safe_buddies / static
  // tourist tables).
  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: shareLocation,
    selfUserId: me?.id ?? null,
  })

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
        hasGpsFix={hasGpsFix || selfGranted || liveLocation.selfGranted}
        selfLiveOverride={
          // Show the broadcaster's pulsing live marker whenever the
          // user is actively sharing — either via this hook
          // (shareLocation on) or the parent (liveLocation.selfGranted
          // is already true from useFocusAutoMedia). Otherwise show
          // the static self marker.
          (shareLocation && selfGranted) || (shareLocation && liveLocation.selfGranted)
        }
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
            shareLocation && (selfGranted || liveLocation.selfGranted)
              ? 'bg-success-bg text-success border-success'
              : shareLocation && (selfDenied || liveLocation.selfDenied)
                ? 'bg-warning-bg text-warning border-warning'
                : 'bg-focus-surface text-focus-muted border-focus-border'
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              shareLocation && (selfGranted || liveLocation.selfGranted)
                ? 'bg-success animate-pulse'
                : shareLocation && (selfDenied || liveLocation.selfDenied)
                  ? 'bg-warning'
                  : 'bg-focus-muted'
            }`}
            aria-hidden="true"
          />
          {shareLocation
            ? selfGranted || liveLocation.selfGranted
              ? 'Sharing live'
              : selfDenied || liveLocation.selfDenied
                ? 'Location off'
                : 'Locating…'
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
