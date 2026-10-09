'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { LiveLocation } from '@/hooks/useLiveUserLocations'

interface BuddyPin {
  id: string
  name: string
  city: string | null
  lat: number
  lng: number
  is_online: boolean
  languages: string[]
  specialties: string[]
  rating_avg: number | null
  hourly_rate: number | null
}

interface Props {
  userLocation: { lat: number; lng: number }
  height?: string | number
  showSelfMarker?: boolean
  /** True when the caller has confirmed the user's GPS fix (not the Da Nang fallback). */
  hasGpsFix?: boolean
  onSelectBuddy?: (id: string) => void
  /** Other signed-in users sharing their live position (no DB). */
  liveLocations?: LiveLocation[]
  /** Hide the static "You are here" marker even when granted — useful when
   *  we want to use the broadcaster's own marker instead. */
  selfLiveOverride?: boolean
  /** Current signed-in user id. When provided, the map will NEVER render
   *  a live marker for this user — the self marker (or pulsing live self
   *  marker) already represents their position. Fixes the duplicate-pin
   *  bug where the publisher's own row was echoed back via the
   *  `location_updates` postgres_changes subscription before
   *  `getCurrentUser()` resolved. */
  selfUserId?: string | null
}

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 } // Da Nang

// Map markers: Tropical Jade palette only, no drop-shadow. Token-derived hex.
// Buddy uses stop-3 jade teal (the rich mid-stop); self uses the deep ocean
// stop-6; live broadcasts use the brand-pop stop-1 jade-mint so the pulse
// reads against any backdrop.
const PRIMARY = '#0D9488'
const INK = '#134E4A'
const INFO = '#34D399'
const MUTED = '#4B5563'

// RAM OPTIMIZATION (2026-10-08): Cache DivIcon instances at module scope.
// Calling L.divIcon({...}) allocates a fresh HTMLDivElement + style block
// per call, which means every Marker re-render or buddy list refresh
// produced a brand-new icon. The icon cache below is a Map keyed by
// a stable string (e.g. "Y:ink", "B:primary") so re-renders reuse the
// same instance. Markers with the same visual identity now share one
// icon. Saves ~2-3KB per marker per re-render.
const ICON_CACHE = new Map<string, L.DivIcon>()

function flatIcon(letter: string, bg: string): L.DivIcon {
  // zIndexOffset is set on the Marker, not the icon, but we add a base
  // class on the icon's root so the marker can be re-targeted via CSS.
  const key = `flat:${letter}:${bg}`
  const cached = ICON_CACHE.get(key)
  if (cached) return cached
  const icon = L.divIcon({
    html: `<div class="localit-marker-pin" style="width:24px;height:24px;background:${bg};border:2px solid #ECFDF5;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#ECFDF5;font-weight:600;font-size:11px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:-0.02em;">${letter}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
    className: 'localit-marker',
  })
  ICON_CACHE.set(key, icon)
  return icon
}

function livePulseIcon(): L.DivIcon {
  const key = 'live:pulse'
  const cached = ICON_CACHE.get(key)
  if (cached) return cached
  const icon = L.divIcon({
    html: `<div class="localit-marker-pin" style="position:relative;width:18px;height:18px;background:${INFO};border:2px solid #ECFDF5;border-radius:50%;"></div><div style="position:absolute;top:-5px;left:-5px;width:28px;height:28px;background:${INFO};border-radius:50%;opacity:0.22;"></div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
    popupAnchor: [0, -14],
    className: 'localit-marker',
  })
  ICON_CACHE.set(key, icon)
  return icon
}

export default function MapView({ userLocation, height = '100%', showSelfMarker = true, hasGpsFix = false, onSelectBuddy, liveLocations = [], selfLiveOverride = false, selfUserId = null }: Props) {
  const [buddies, setBuddies] = useState<BuddyPin[]>([])
  const [tourists, setTourists] = useState<BuddyPin[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // RAM OPTIMIZATION (2026-10-08): Use AbortController so the
    // Supabase fetch is cancelled on unmount. Without this, a
    // route change that happens mid-fetch (e.g. /map → /dashboard
    // within 100ms of mount) leaves the response body in the
    // socket buffer until the network teardown. The browser still
    // calls .then() on the resolved promise, which writes the
    // buddy list into the now-unmounted component's closure —
    // a classic "setState on unmounted" memory leak.
    const abortCtrl = new AbortController()
    let cancelled = false
    async function load() {
      const supabase = createClient()
      // Exclude the current user from static pins — they shouldn't see
      // their own row in either the buddy or tourist pin layer.
      const { data: authData } = await supabase.auth.getUser()
      const me = authData.user?.id ?? null
      const excludeSelf = (q: any) =>
        me ? q.neq('id', me) : q
      // can't read buddies.latitude directly since the 2026-09-26 PII tighten.
      // safe_buddies exposes the same shape the map pins need.
      const { data: buddyData } = await excludeSelf(
        supabase
          .from('safe_buddies')
          .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, profile:safe_profiles(full_name, is_online)')
          .not('latitude', 'is', null)
          .not('longitude', 'is', null),
      ).abortSignal(abortCtrl.signal)

      if (!cancelled && buddyData) {
        const pins: BuddyPin[] = buddyData
          .filter((b: any) => b.latitude !== null && b.longitude !== null)
          .map((b: any) => ({
            id: b.id,
            name: b.profile?.full_name ?? 'Buddy',
            city: b.location_city,
            lat: b.latitude,
            lng: b.longitude,
            is_online: b.profile?.is_online ?? false,
            languages: b.languages ?? [],
            specialties: b.specialties ?? [],
            rating_avg: null,
            hourly_rate: b.hourly_rate ?? null,
          }))
        setBuddies(pins)
      }

      try {
        // Static discoverable tourists (lat/lng from their tourist row).
        // Pairs with the location_updates live pins below so a tourist
        // who set their home city but isn't currently broadcasting still
        // shows up on the map.
        const { data: tStatic } = await excludeSelf(
          supabase
            .from('safe_tourists_with_location')
            .select('id, location_city, latitude, longitude, profile:safe_profiles(full_name, is_online)')
            .not('latitude', 'is', null)
            .not('longitude', 'is', null),
        ).abortSignal(abortCtrl.signal)

        // location_updates: tourists' live positions, anon can only read buddy-owned rows.
        // safe_profiles gives anon access to full_name/role/is_online (no PII).
        const { data: locs } = await supabase
          .from('location_updates')
          .select('user_id, latitude, longitude, profile:safe_profiles(role, full_name)')
          .order('updated_at', { ascending: false })
          .limit(50)
          .abortSignal(abortCtrl.signal)

        if (!cancelled) {
          const seen = new Set<string>()
          const tPins: BuddyPin[] = []

          // Static pin wins on ties so a registered-but-idle tourist
          // shows up at their home coordinate rather than being
          // skipped just because they haven't pushed a heartbeat.
          for (const t of (tStatic ?? []) as any[]) {
            if (seen.has(t.id)) continue
            seen.add(t.id)
            tPins.push({
              id: t.id,
              name: t.profile?.full_name ?? 'Tourist',
              city: t.location_city,
              lat: t.latitude,
              lng: t.longitude,
              is_online: t.profile?.is_online ?? false,
              languages: [],
              specialties: [],
              rating_avg: null,
              hourly_rate: null,
            })
          }
          // Live pins fill the gap for tourists whose static row is
          // missing (older accounts predating safe_tourists_with_location).
          for (const l of (locs ?? []) as any[]) {
            if (seen.has(l.user_id)) continue
            if (l.profile?.role !== 'tourist') continue
            seen.add(l.user_id)
            tPins.push({
              id: l.user_id,
              name: l.profile?.full_name ?? 'Tourist',
              city: null,
              lat: l.latitude,
              lng: l.longitude,
              is_online: true,
              languages: [],
              specialties: [],
              rating_avg: null,
              hourly_rate: null,
            })
          }
          setTourists(tPins)
        }
      } catch {
        // ignore RLS errors silently
      }

      if (!cancelled) setLoading(false)
    }
    load()
    return () => {
      cancelled = true
      abortCtrl.abort()
    }
  }, [])

  // RECENTER — only when the user has actually moved more than ~50m
  // AND not more than every 5s. The previous FlyToUser forced
  // setView(zoom:13) on every map ready, which clobbered the user's
  // chosen zoom level and reset the view whenever React re-rendered
  // (every buddy/tourist state update). Now the map keeps whatever
  // zoom the user picked, and only pans to follow them when they
  // really move. flyTo (smooth) instead of setView (instant) so the
  // user can still grab the map and pan away.
  function RecenterOnUserMove() {
    const map = useMap()
    const lastRef = useRef<{ lat: number; lng: number; t: number } | null>(null)
    useEffect(() => {
      const now = Date.now()
      const last = lastRef.current
      const moved = !last ||
        Math.abs(last.lat - userLocation.lat) > 0.0005 ||
        Math.abs(last.lng - userLocation.lng) > 0.0005
      const cooled = !last || now - last.t > 5000
      if (moved && cooled) {
        map.flyTo([userLocation.lat, userLocation.lng], map.getZoom(), { animate: true, duration: 0.6 })
        lastRef.current = { lat: userLocation.lat, lng: userLocation.lng, t: now }
      }
    }, [map, userLocation.lat, userLocation.lng])
    return null
  }

  // RESIZER — react-leaflet 5 auto-calls invalidateSize() once on
  // mount, but if the parent reflows after the map is ready (which
  // is exactly what happens when the buddy list hydrates and pushes
  // the page around) the tile pane keeps the old size and tiles
  // stop rendering. We:
  //  - call invalidateSize() after `loading` flips false (buddy
  //    list is the biggest layout shift on /dashboard and /browse)
  //  - observe the container with ResizeObserver and re-fire on
  //    any size change
  //  - also fire on next animation frame so we catch the first
  //    paint that has the real height
  //
  // RAM OPTIMIZATION (2026-10-08): the previous version stashed the
  // debounce timer handle on the same `t` setTimeout instance as
  // `.observe()` setup, which meant a second ResizeObserver tick
  // ran `clearTimeout((t as any)._r)` BEFORE the first
  // `.observe()` callback had a chance to assign `_r` — it worked
  // but was subtle. The fix uses a useRef for the debounce handle
  // so we can clear and re-set it cleanly, AND we debounce
  // invalidateSize to 100ms so a window resize fires the
  // expensive layout pass at most 10×/s.
  function MapResizer() {
    const map = useMap()
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    useEffect(() => {
      const raf = requestAnimationFrame(() => map.invalidateSize())
      const t = setTimeout(() => map.invalidateSize(), 200)
      const ro = new ResizeObserver(() => {
        if (debounceRef.current !== null) clearTimeout(debounceRef.current)
        debounceRef.current = setTimeout(() => map.invalidateSize(), 100)
      })
      const el = map.getContainer()
      ro.observe(el)
      return () => {
        cancelAnimationFrame(raf)
        clearTimeout(t)
        if (debounceRef.current !== null) {
          clearTimeout(debounceRef.current)
          debounceRef.current = null
        }
        ro.disconnect()
      }
    }, [map])
    // Re-fire when buddies finish hydrating — biggest layout shift.
    useEffect(() => {
      if (!loading) {
        requestAnimationFrame(() => map.invalidateSize())
        setTimeout(() => map.invalidateSize(), 50)
      }
    }, [map, loading])
    return null
  }

  // RAM OPTIMIZATION (2026-10-08): react-leaflet 5 already calls
  // `map.remove()` on unmount (see node_modules/react-leaflet/lib/MapContainer.js).
  // Calling it a second time from `MapDisposer` triggered
  // "Map container is being reused by another instance" and
  // "_leaflet_pos undefined" TypeError on /dashboard and /map (see
  // scripts/diag-map-realtime-leak.mjs, 2 segment errors in 30s).
  //
  // The disposer is now a no-op on React unmount — react-leaflet handles
  // cleanup. We still register `beforeunload` to call `map.off()` +
  // clear the tile-layer cache so all event listeners + the in-memory
  // tile cache (~5-8MB of PNG blobs for a city-sized view) are released
  // before the tab closes. A slow tab close can otherwise keep a
  // Realtime socket open and hold the tile cache alive for 30-60s.
  function MapDisposer() {
    const map = useMap()
    useEffect(() => {
      const teardown = () => {
        try { map.off() } catch { /* ignore */ }
        try {
          // Clear Leaflet's tile-layer cache. Each Layer's
          // _tiles is a Map<key, HTMLImageElement> — we drop it
          // so the GC can reclaim the image bitmaps. Without
          // this, a closed tab that hasn't been hard-reloaded
          // can hold 5-10MB of tile PNGs in JS heap.
          map.eachLayer((layer: any) => {
            if (layer && typeof layer._tiles === 'object' && layer._tiles instanceof Map) {
              layer._tiles.clear()
            }
          })
        } catch { /* ignore */ }
      }
      window.addEventListener('beforeunload', teardown)
      return () => {
        window.removeEventListener('beforeunload', teardown)
        // Do NOT call map.off() or map.remove() on React unmount —
        // react-leaflet 5 owns the instance lifecycle.
      }
    }, [map])
    return null
  }

  // CARTO Basemaps API key — set via NEXT_PUBLIC_CARTO_BASEMAPS_KEY
  // (build-time inlined). Required as of 2026-10-08 to remove the
  // "API KEY REQUIRED" watermark that CARTO now serves to unauthenticated
  // tile requests. See `vercel env ls production` for the active key.
  const CARTO_KEY = process.env.NEXT_PUBLIC_CARTO_BASEMAPS_KEY ?? ''
  const TILE_URL = CARTO_KEY
    ? `https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png?key=${CARTO_KEY}`
    : 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png'

  return (
    <div className="map-frame relative" style={{ position: 'relative', height, width: '100%', zIndex: 0, isolation: 'isolate' }}>
      <MapContainer
        center={[userLocation.lat, userLocation.lng]}
        zoom={13}
        scrollWheelZoom={true}
        zoomControl={true}
        attributionControl={true}
        preferCanvas={false}
        style={{ height: '100%', width: '100%' }}
        worldCopyJump={true}
      >
        <MapResizer />
        <MapDisposer />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
          url={TILE_URL}
          subdomains={['a', 'b', 'c', 'd']}
          maxZoom={19}
          minZoom={3}
          updateWhenZooming={false}
          keepBuffer={2}
        />
        <RecenterOnUserMove />

        {/* Self marker — only when we have a real GPS fix (not the Da Nang fallback).
            When selfLiveOverride is true the user is actively broadcasting live,
            so we use the pulsing live icon. Otherwise the flat dark "Y" dot. */}
        {showSelfMarker && hasGpsFix && (
          <Marker
            position={[userLocation.lat, userLocation.lng]}
            icon={selfLiveOverride ? livePulseIcon() : flatIcon('Y', INK)}
            zIndexOffset={1000}
          >
            <Popup>
              <strong>{selfLiveOverride ? 'You (live)' : 'You are here'}</strong>
            </Popup>
          </Marker>
        )}

        {buddies.map((b) => (
          <Marker
            key={`buddy-${b.id}`}
            position={[b.lat, b.lng]}
            icon={flatIcon('B', PRIMARY)}
            zIndexOffset={500}
            eventHandlers={{ click: () => onSelectBuddy?.(b.id) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong style={{ display: 'block', marginBottom: 2 }}>{b.name}</strong>
                <div style={{ fontSize: 12, color: '#4B5563' }}>{b.city ?? 'Da Nang'}</div>
                {b.languages.length > 0 ? (
                  <div style={{ fontSize: 12, marginTop: 4, color: '#0A1F1D' }}>
                    {b.languages.slice(0, 2).join(', ')}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, marginTop: 4 }}>{b.is_online ? 'Online' : 'Offline'}</div>
                <Link
                  href={`/search?lat=${b.lat}&lng=${b.lng}&radius=5`}
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    color: '#0A1F1D',
                    fontWeight: 500,
                    fontSize: 12,
                    textDecoration: 'none',
                    marginRight: 8,
                  }}
                >
                  Buddies near here
                </Link>
                <Link
                  href={`/buddies/${b.id}`}
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    color: '#0D9488',
                    fontWeight: 500,
                    fontSize: 12,
                    textDecoration: 'none',
                  }}
                >
                  View profile
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}

        {tourists.map((t) => (
          <Marker key={`tourist-${t.id}`} position={[t.lat, t.lng]} icon={flatIcon('T', MUTED)} zIndexOffset={100}>
            <Popup>
              <strong>{t.name}</strong>
              <div style={{ fontSize: 12, color: '#4B5563' }}>Tourist</div>
            </Popup>
          </Marker>
        ))}

        {liveLocations.map((l) => {
          // Skip the broadcaster's own row — already represented by the
          // self marker (or pulsing live self marker). The duplicate
          // happens when the publish() call writes a row before
          // userIdRef is populated, so the postgres_changes handler
          // can't filter on the ref yet. Filtering at render time
          // is the reliable backstop.
          if (selfUserId && l.userId === selfUserId) return null
          return (
            <Marker key={`live-${l.userId}`} position={[l.lat, l.lng]} icon={livePulseIcon()} zIndexOffset={2000}>
              <Popup>
                <strong>{l.name}</strong>
                <div style={{ fontSize: 12, color: '#4B5563' }}>Sharing live</div>
              </Popup>
            </Marker>
          )
        })}
      </MapContainer>

      {loading ? (
        <div
          className="absolute top-4 right-4 z-toast bg-paper border border-border rounded-sm p-2 text-xs text-ink flex items-center gap-2"
        >
          <div className="loading-spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
          Loading map...
        </div>
      ) : null}
    </div>
  )
}

export { DEFAULT_LOCATION }