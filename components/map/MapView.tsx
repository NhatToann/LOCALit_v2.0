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

export default function MapView({ userLocation, height = '100%', showSelfMarker = true, onSelectBuddy, liveLocations = [], selfLiveOverride = false }: Props) {
  const [buddies, setBuddies] = useState<BuddyPin[]>([])
  const [tourists, setTourists] = useState<BuddyPin[]>([])
  const [loading, setLoading] = useState(true)
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    let cancelled = false
    async function load() {
      const supabase = createClient()

      const { data: buddyData } = await supabase
        .from('buddies')
        .select('id, location_city, latitude, longitude, languages, specialties, hourly_rate, is_available, profile:profiles(full_name, is_online)')
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
        const { data: locs } = await supabase
          .from('location_updates')
          .select('user_id, latitude, longitude, profile:profiles(role, full_name)')
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

  const userIcon = L.divIcon({
    html: '<div style="width:24px;height:24px;background:#4dd0e1;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">★</div>',
    iconSize: [24, 24],
    className: '',
  })
  const buddyIcon = L.divIcon({
    html: '<div style="width:30px;height:30px;background:#FF6B35;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:14px;">B</div>',
    iconSize: [30, 30],
    className: '',
  })
  const touristIcon = L.divIcon({
    html: '<div style="width:26px;height:26px;background:#17A2B8;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:12px;">T</div>',
    iconSize: [26, 26],
    className: '',
  })
  const liveIcon = L.divIcon({
    html: '<div style="position:relative;width:18px;height:18px;background:#3b82f6;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);"></div><div style="position:absolute;top:-4px;left:-4px;width:26px;height:26px;background:#3b82f6;border-radius:50%;opacity:0.25;animation:livePulse 2s ease-out infinite;"></div>',
    iconSize: [26, 26],
    className: '',
  })

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
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
            <Popup><strong>You are here</strong></Popup>
          </Marker>
        )}

        {buddies.map((b) => (
          <Marker
            key={`buddy-${b.id}`}
            position={[b.lat, b.lng]}
            icon={buddyIcon}
            eventHandlers={{ click: () => onSelectBuddy?.(b.id) }}
          >
            <Popup>
              <div style={{ minWidth: 160 }}>
                <strong>{b.name}</strong>
                <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>📍 {b.city}</div>
                <div style={{ fontSize: 12, marginTop: 4 }}>🗣️ {b.languages.slice(0, 2).join(', ')}</div>
                <div style={{ fontSize: 12 }}>{b.is_online ? '🟢 Online' : '⚪ Offline'}</div>
                <Link href={`/tourist/buddy/${b.id}`} style={{ display: 'inline-block', marginTop: 8, color: '#FF6B35', fontWeight: 600, fontSize: 12 }}>
                  View profile →
                </Link>
              </div>
            </Popup>
          </Marker>
        ))}

        {tourists.map((t) => (
          <Marker key={`tourist-${t.id}`} position={[t.lat, t.lng]} icon={touristIcon}>
            <Popup>
              <strong>{t.name}</strong>
              <div style={{ fontSize: 12, color: '#666' }}>🧳 Du khách</div>
            </Popup>
          </Marker>
        ))}

        {liveLocations.map((l) => (
          <Marker key={`live-${l.userId}`} position={[l.lat, l.lng]} icon={liveIcon}>
            <Popup>
              <strong>{l.name}</strong>
              <div style={{ fontSize: 12, color: '#666' }}>📍 Live now</div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>

      {loading && (
        <div style={{
          position: 'absolute', top: 16, right: 16, zIndex: 1000,
          background: 'white', padding: '6px 12px', borderRadius: 8,
          boxShadow: '0 2px 8px rgba(0,0,0,.15)', fontSize: 13,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <div className="loading-spinner" style={{ width: 14, height: 14 }} />
          Loading map...
        </div>
      )}
    </div>
  )
}

export { DEFAULT_LOCATION }
