'use client'

import { useEffect, useState, useCallback } from 'react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import {
  MapPin,
  AlertTriangle,
  MessageCircle,
  X,
  List,
  Eye,
  EyeOff,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import { useLocationWatcher } from '@/hooks/useLocationWatcher'
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

interface BuddyMarker {
  id: string
  name: string
  city: string | null
  languages: string[]
  rating_avg: number | null
  lat: number
  lng: number
  is_online: boolean
  avatar_url?: string | null
}

export default function MapPage() {
  const [buddies, setBuddies] = useState<BuddyMarker[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [shareLocation, setShareLocation] = useState(false)
  const [hasGpsFix, setHasGpsFix] = useState(false)
  // FIX (2026-09-27): auth state must come from the Supabase session, NOT from
  // the geolocation permission grant. Previously, users who denied or timed
  // out on geolocation were incorrectly flagged as "not signed in" even when
  // their auth cookie was valid.
  const [signedIn, setSignedIn] = useState(false)
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)

  // RAM OPTIMIZATION (2026-10-08): useLocationWatcher re-runs its
  // useEffect when onGranted / onDenied change. If those props are
  // fresh arrow functions every render (as the previous inline
  // `() => setHasGpsFix(true)` was), the effect re-fires every
  // render — which calls `geolocation.clearWatch` + re-creates
  // `watchPosition` on every parent state update, churning
  // geolocation subscriptions and a watchPosition handle each
  // pass. useCallback + empty deps gives a stable identity; the
  // setters it calls are already stable per React docs.
  const onGpsGranted = useCallback(() => setHasGpsFix(true), [])
  const onGpsDenied = useCallback(() => setHasGpsFix(false), [])

  // Geolocation — used ONLY to position the user's dot on the map.
  const userLocation = useLocationWatcher({
    writeToDb: false,
    onGranted: onGpsGranted,
    onDenied: onGpsDenied,
  })

  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: shareLocation && signedIn,
    selfUserId: currentUserId,
  })

  // Check auth session once on mount + listen for changes.
  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setSignedIn(!!data.user)
      setCurrentUserId(data.user?.id ?? null)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setSignedIn(!!session?.user)
      setCurrentUserId(session?.user?.id ?? null)
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('safe_buddies')
        .select(
          'id, location_city, latitude, longitude, languages, hourly_rate, profile:safe_profiles(full_name, avatar_url, is_online)',
        )
        .eq('location_city', 'Da Nang')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (data) {
        const mapped: BuddyMarker[] = (data as any[])
          .filter((b) => b.latitude !== null && b.longitude !== null)
          .map((b) => ({
            id: b.id,
            name: b.profile?.full_name ?? 'Buddy',
            city: b.location_city,
            languages: b.languages ?? [],
            rating_avg: null,
            lat: b.latitude,
            lng: b.longitude,
            is_online: !!b.profile?.is_online,
            avatar_url: b.profile?.avatar_url ?? null,
          }))
        setBuddies(mapped)
      }
    }
    load()
    // Refresh every 30s so the heartbeat-driven is_online updates
    // without a page reload. The global presence broadcast (t2) is
    // the sub-second layer; this 30s poll is the safety net for
    // pages that don't subscribe to it directly.
    const interval = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'visible') {
        load()
      }
    }, 30_000)
    return () => clearInterval(interval)
  }, [])

  const selected = buddies.find((b) => b.id === selectedId)

  return (
    <div className="container-page py-8">
      {/* Map is the dominant element on this page — render it first,
          then the page-level header (page title, share button, error
          alert, status line) below it. This keeps the map visually
          on top of any overflow and gives the header the bottom
          anchor of the page rhythm. */}
      {error ? (
        <div className="alert alert-error mb-4" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      <div
        className="map-frame relative border border-border rounded-sm overflow-hidden bg-surface"
        style={{ position: 'relative', zIndex: 0, isolation: 'isolate', height: 'calc(100vh - 360px)', minHeight: 420 }}
      >
        <MapView
          userLocation={userLocation}
          height="100%"
          hasGpsFix={hasGpsFix || selfGranted}
          onSelectBuddy={(id) => setSelectedId(id)}
          liveLocations={liveLocations}
          selfLiveOverride={selfGranted}
          selfUserId={currentUserId}
        />

        {/* Legend — sits on top of every Leaflet pane (markers z=600,
            popups z=700, control z=800) so the marker icons never
            occlude the legend dots. See app/globals.css → .z-legend */}
        <aside
          className="absolute bottom-4 left-4 z-legend bg-surface border border-border rounded-sm p-3 text-xs"
          aria-label="Map legend"
        >
          <p className="text-eyebrow text-muted mb-2">
            Legend
            <span
              className="ml-1 italic text-subtle"
              style={{ letterSpacing: '0.02em' }}
              aria-hidden="true"
            >
              chú thích
            </span>
          </p>
          <ul className="space-y-1">
            <li className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full bg-primary inline-block"
                aria-hidden="true"
              />
              Local buddy
            </li>
            <li className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full bg-info inline-block"
                aria-hidden="true"
              />
              Tourist (saved)
            </li>
            <li className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full bg-info inline-block"
                aria-hidden="true"
              />
              Live tourist
            </li>
            <li className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full bg-ink inline-block border border-surface"
                aria-hidden="true"
              />
              You
            </li>
          </ul>
        </aside>

        {/* Selected popup — sits one layer above the legend so a long
            legend never visually overlaps the detail card. */}
        {selected ? (
          <aside
            className="absolute top-4 right-4 z-aside w-72 bg-surface border border-border rounded-sm p-4"
            aria-label={`Selected buddy ${selected.name}`}
          >
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              className="absolute top-2 right-2 inline-flex items-center justify-center w-7 h-7 rounded-sm text-muted hover:bg-paper hover:text-ink"
            >
              <X size={14} aria-hidden="true" />
            </button>
            <div className="flex items-center gap-3 mb-3">
              {selected.avatar_url ? (
                <img
                  src={selected.avatar_url}
                  alt={`${selected.name} avatar`}
                  className="avatar avatar-lg"
                  style={{ width: 56, height: 56, objectFit: 'cover' }}
                />
              ) : (
                <span className="avatar avatar-lg" aria-hidden="true">
                  {selected.name.charAt(0)}
                </span>
              )}
              <div>
                <p className="text-base font-semibold text-ink">{selected.name}</p>
                <p className="text-xs text-muted">
                  <MapPin size={12} className="inline-block mr-1 align-middle" aria-hidden="true" />
                  {selected.city ?? 'Da Nang'}
                </p>
              </div>
            </div>
            <p className="text-xs text-muted mb-3">
              Speaks {selected.languages.slice(0, 3).join(', ') || 'multiple languages'}
            </p>
            <div className="flex gap-2">
              <Link
                href={`/buddies/${selected.id}`}
                className="inline-flex items-center justify-center flex-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                Profile
              </Link>
              <Link
                href={`/chat?buddy=${selected.id}`}
                className="inline-flex items-center justify-center flex-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                <MessageCircle size={14} className="mr-1" aria-hidden="true" />
                Message
              </Link>
            </div>
          </aside>
        ) : null}
      </div>

      {/* Page-level header BELOW the map. The share button, page
          title, and status line are anchored to the bottom of the
          map so the map remains the dominant element. */}
      <header className="mt-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-primary mb-2">
            Live map
            <span
              className="ml-2 italic text-muted"
              style={{ letterSpacing: '0.02em' }}
              aria-hidden="true"
            >
              bản đồ trực tiếp
            </span>
          </p>
          <h1 className="text-page-title">Buddies in Da Nang</h1>
          <p className="text-sm text-muted mt-1 max-w-prose">
            LOCALit maps{' '}
            <span
              style={{
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {buddies.length}
            </span>{' '}
            verified local buddies across Da Nang. Tap a pin to view their
            profile and start a conversation. Tourists who opt in also appear in
            real-time.
          </p>
          <p className="text-xs text-muted mt-1">
            {selfGranted
              ? 'Sharing your live location.'
              : selfDenied
              ? 'Location permission denied.'
              : 'Location sharing off.'}
            {liveLocations.length > 0 ? ` ${liveLocations.length} live tourist${liveLocations.length === 1 ? '' : 's'} nearby.` : ''}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (!signedIn) {
                setError('Please sign in to share your live location.')
                return
              }
              setError('')
              setShareLocation((v) => !v)
            }}
            className={`inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm border ${
              shareLocation
                ? 'bg-primary text-paper border-primary hover:bg-primary-hover'
                : 'bg-transparent text-ink border-border-strong hover:bg-paper'
            }`}
          >
            {shareLocation ? (
              <>
                <EyeOff size={14} aria-hidden="true" />
                Sharing live
              </>
            ) : (
              <>
                <Eye size={14} aria-hidden="true" />
                Share my location
              </>
            )}
          </button>
          <Link
            href="/browse"
            className="inline-flex items-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <List size={14} aria-hidden="true" />
            List view
          </Link>
        </div>
      </header>
    </div>
  )
}
