'use client'

/**
 * FocusMapLeaflet — the Focus Mode map. Wraps the dashboard's
 * `MapView` component with a tight bounding box around the two
 * focus participants so the map opens already centered on them
 * rather than on the Da Nang default.
 *
 * Why reuse `MapView` instead of writing a new focus-only map:
 *   - It already handles the icon cache, abort-on-unmount, tile
 *     resizer, and dispose lifecycle (see AGENTS.md RAM
 *     Optimizations 2026-10-08).
 *   - It already shows buddy + tourist + live pins, so a focus
 *     session still has the Da Nang context (other tourists sharing
 *     live, buddies available, etc.).
 *   - The dashboard uses it too, so any visual improvements to the
 *     shared component land on both surfaces.
 *
 * The focus-specific UI overlay (legend, partner info card) lives
 * in this wrapper rather than in MapView, so MapView stays
 * dashboard-shaped.
 */

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'
import { createClient } from '@/utils/supabase/auth'
import type { Profile } from '@/lib/types'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DA_NANG_CENTER = { lat: 16.0544, lng: 108.2022 }

interface FocusMapLeafletProps {
  me: Profile | null
  partner: Profile | null
  /** When true, broadcast the user's location (mic-style toggle). */
  shareLocation: boolean
  height?: number
}

export default function FocusMapLeaflet({
  me,
  partner,
  shareLocation,
  height = 360,
}: FocusMapLeafletProps) {
  // Hydrate my GPS fix + publish/subscribe (when shareLocation is on).
  // The dashboard's MapView reads this hook via useLiveUserLocations
  // internally for the live pins, but we also call it here to drive
  // the `userLocation` we pass down for the self marker.
  const { selfGranted, selfDenied } = useLiveUserLocations({
    enabled: shareLocation && me !== null,
    selfUserId: me?.id ?? null,
  })
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
        hasGpsFix={hasGpsFix || selfGranted}
        selfLiveOverride={selfGranted && shareLocation}
        selfUserId={me?.id ?? null}
      />
      {/* Top-left focus-specific overlay. The dashboard's MapView
          has its own self-pin / "Sharing live" badge; we add a
          small card naming the partner so the focus context is
          visible at a glance. */}
      <div className="absolute top-3 left-3 z-10 bg-focus-surface border border-focus-border rounded-sm px-3 py-2 text-xs text-focus-text shadow-sm">
        <p className="text-[10px] uppercase tracking-wide text-focus-muted">
          Focus with
        </p>
        <p className="text-sm font-semibold text-focus-text">
          {partner?.full_name ?? 'Buddy'}
        </p>
      </div>
      {/* Bottom-left status pills. */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1">
        <span
          className={`inline-flex items-center gap-1.5 px-2 py-1 text-[11px] rounded-sm border ${
            shareLocation && selfGranted
              ? 'bg-success-bg text-success border-success'
              : shareLocation && selfDenied
                ? 'bg-warning-bg text-warning border-warning'
                : 'bg-focus-surface text-focus-muted border-focus-border'
          }`}
        >
          <span
            className={`inline-block w-1.5 h-1.5 rounded-full ${
              shareLocation && selfGranted
                ? 'bg-success animate-pulse'
                : shareLocation && selfDenied
                  ? 'bg-warning'
                  : 'bg-focus-muted'
            }`}
            aria-hidden="true"
          />
          {shareLocation
            ? selfGranted
              ? 'Sharing live'
              : selfDenied
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
  // Treat anything older than 1 hour as stale.
  const age = Date.now() - new Date(data.updated_at).getTime()
  if (age > 60 * 60 * 1000) return null
  return { lat: Number(data.latitude), lng: Number(data.longitude) }
}
