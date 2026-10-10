'use client'

/**
 * FocusMapLeaflet — the Focus Mode map. Wraps the dashboard's
 * `MapView` component with a tight bounding box around the two
 * focus participants so the map opens already centered on them
 * rather than on the Da Nang default.
 *
 * The page-level parent calls useLiveUserLocations ONCE and passes
 * the relevant state down — this hook is one Realtime subscription
 * per page, not per consumer. Calling it from both the parent and
 * this component would double-subscribe the same
 * `da-nang-live-locations-pg` channel and Supabase throws on the
 * second `.on(...)` after the first `.subscribe()`.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import type { Profile } from '@/lib/types'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DA_NANG_CENTER = { lat: 16.0544, lng: 108.2022 }

export interface LiveLocationState {
  selfGranted: boolean
  selfDenied: boolean
}

interface FocusMapLeafletProps {
  me: Profile | null
  partner: Profile | null
  /** When true, broadcast the user's location (mic-style toggle). */
  shareLocation: boolean
  /** Live location state owned by the parent (avoids double Realtime subs). */
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
  const [userLocation, setUserLocation] = useState(DA_NANG_CENTER)
  const [hasGpsFix, setHasGpsFix] = useState(false)

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return
    if (!shareLocation) {
      setHasGpsFix(false)
      // Fall back to the partner's location or Da Nang center.
      void (async () => {
        const partnerFix = await fetchPartnerFix(partner?.id ?? null)
        if (partnerFix) {
          setUserLocation(partnerFix)
          setHasGpsFix(true)
        } else {
          setUserLocation(DA_NANG_CENTER)
          setHasGpsFix(false)
        }
      })()
      return
    }
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
  }, [shareLocation, partner?.id])

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
        hasGpsFix={hasGpsFix || liveLocation.selfGranted}
        selfLiveOverride={liveLocation.selfGranted && shareLocation}
        selfUserId={me?.id ?? null}
      />
      <div className="absolute top-3 left-3 z-10 bg-focus-surface border border-focus-border rounded-sm px-3 py-2 text-xs text-focus-text shadow-sm">
        <p className="text-[10px] uppercase tracking-wide text-focus-muted">
          Focus with
        </p>
        <p className="text-sm font-semibold text-focus-text">
          {partner?.full_name ?? 'Buddy'}
        </p>
      </div>
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-sm border ${
            shareLocation && liveLocation.selfGranted
              ? 'bg-success-bg text-success border-success'
              : shareLocation && liveLocation.selfDenied
                ? 'bg-warning-bg text-warning border-warning'
                : 'bg-focus-surface text-focus-muted border-focus-border'
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              shareLocation && liveLocation.selfGranted
                ? 'bg-success animate-pulse'
                : shareLocation && liveLocation.selfDenied
                  ? 'bg-warning'
                  : 'bg-focus-muted'
            }`}
            aria-hidden="true"
          />
          {shareLocation
            ? liveLocation.selfGranted
              ? 'Sharing live'
              : liveLocation.selfDenied
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
async function fetchPartnerFix(partnerId: string | null): Promise<{ lat: number; lng: number } | null> {
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
