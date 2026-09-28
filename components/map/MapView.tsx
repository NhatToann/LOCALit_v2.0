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
  onSelectBuddy?: (id: string) => void
  /** Other signed-in users sharing their live position (no DB). */
  liveLocations?: LiveLocation[]
  /** Hide the static "You are here" marker even when granted — useful when
   *  we want to use the broadcaster's own marker instead. */
  selfLiveOverride?: boolean
}

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 } // Da Nang

// Map markers: brand palette only, no drop-shadow. Token-derived hex.
// primary #FF6B35 (buddy), ink #0F0F0F (self), info #075985 (live)
const PRIMARY = '#FF6B35'
const INK = '#0F0F0F'
const INFO = '#075985'

function flatIcon(letter: string, bg: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:24px;height:24px;background:${bg};border:2px solid #FFFFFF;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:600;font-size:11px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;letter-spacing:-0.02em;">${letter}</div>`,
    iconSize: [24, 24],
    className: '',
  })
}

function livePulseIcon(): L.DivIcon {
  return L.divIcon({
    html: `<div style="position:relative;width:18px;height:18px;background:${INFO};border:2px solid #FFFFFF;border-radius:50%;"></div><div style="position:absolute;top:-5px;left:-5px;width:28px;height:28px;background:${INFO};border-radius:50%;opacity:0.18;"></div>`,
    iconSize: [28, 28],
    className: '',
  })
}

export default function MapView({ userLocation, height = '100%', showSelfMarker = true, onSelectBuddy, liveLocations = [], selfLiveOverride = false }: Props) {
  const [buddies, setBuddies] = useState<BuddyPin[]>([])
  const [tourists, setTourists] = useState<BuddyPin[]>([])
  const [loading, setLoading] = useState(true)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()

      // Use safe_buddies (rounded coords) for public discovery — anon callers
      // can't read buddies.latitude directly since the 2026-09-26 PII tighten.
      // safe_buddies exposes the same shape the map pins need.
      const { data: buddyData } = await supabase
        .from('safe_buddies')
        .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, profile:safe_profiles(full_name, is_online)')
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

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
        // location_updates: tourists' live positions, anon can only read buddy-owned rows.
        // safe_profiles gives anon access to full_name/role/is_online (no PII).
        const { data: locs } = await supabase
          .from('location_updates')
          .select('user_id, latitude, longitude, profile:safe_profiles(role, full_name)')
          .order('updated_at', { ascending: false })
          .limit(50)

        if (!cancelled && locs) {
          const seen = new Set<string>()
          const tPins: BuddyPin[] = []
          for (const l of locs as any[]) {
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

      setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [])

  function FlyToUser() {
    const map = useMap()
    useEffect(() => {
      map.setView([userLocation.lat, userLocation.lng], 13)
    }, [map])
    return null
  }

  return (
    <div style={{ position: 'relative', height, width: '100%' }}>
      <MapContainer
        center={[userLocation.lat, userLocation.lng]}
        zoom={13}
        style={{ height: '100%', width: '100%' }}
        ref={(m) => { mapRef.current = m }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FlyToUser />

        {showSelfMarker && !selfLiveOverride && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={flatIcon('Y', INK)}>
            <Popup><strong>You are here</strong></Popup>
          </Marker>
        )}

        {buddies.map((b) => (
          <Marker
            key={`buddy-${b.id}`}
            position={[b.lat, b.lng]}
            icon={flatIcon('B', PRIMARY)}
            eventHandlers={{ click: () => onSelectBuddy?.(b.id) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong style={{ display: 'block', marginBottom: 2 }}>{b.name}</strong>
                <div style={{ fontSize: 12, color: '#737373' }}>{b.city ?? 'Da Nang'}</div>
                {b.languages.length > 0 ? (
                  <div style={{ fontSize: 12, marginTop: 4, color: '#0F0F0F' }}>
                    {b.languages.slice(0, 2).join(', ')}
                  </div>
                ) : null}
                <div style={{ fontSize: 12, marginTop: 4 }}>{b.is_online ? 'Online' : 'Offline'}</div>
                <Link
                  href={`/tourist/buddy/${b.id}`}
                  style={{
                    display: 'inline-block',
                    marginTop: 8,
                    color: '#FF6B35',
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
          <Marker key={`tourist-${t.id}`} position={[t.lat, t.lng]} icon={flatIcon('T', '#737373')}>
            <Popup>
              <strong>{t.name}</strong>
              <div style={{ fontSize: 12, color: '#737373' }}>Tourist</div>
            </Popup>
          </Marker>
        ))}

        {liveLocations.map((l) => (
          <Marker key={`live-${l.userId}`} position={[l.lat, l.lng]} icon={livePulseIcon()}>
            <Popup>
              <strong>{l.name}</strong>
              <div style={{ fontSize: 12, color: '#737373' }}>Sharing live</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {loading ? (
        <div
          style={{
            position: 'absolute',
            top: 16,
            right: 16,
            zIndex: 1000,
            background: '#FFFFFF',
            border: '1px solid #E5E5E0',
            padding: '6px 12px',
            borderRadius: 4,
            fontSize: 13,
            color: '#0F0F0F',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <div className="loading-spinner" style={{ width: 14, height: 14 }} aria-hidden="true" />
          Loading map...
        </div>
      ) : null}
    </div>
  )
}

export { DEFAULT_LOCATION }
