'use client'

import { useEffect, useState, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { createClient } from '@/utils/supabase/auth'

interface BuddyPin {
  id: string
  name: string
  city: string
  lat: number
  lng: number
  is_online: boolean
  languages: string[]
}

interface Props {
  userLocation: { lat: number; lng: number }
}

export default function MapView({ userLocation }: Props) {
  const [buddies, setBuddies] = useState<BuddyPin[]>([])
  const [tourists, setTourists] = useState<BuddyPin[]>([])
  const mapRef = useRef<L.Map | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()

      // Load buddies with their latest locations
      const { data: buddyLocations } = await supabase
        .from('buddies')
        .select('*, profile:profiles(*)')
        .eq('is_available', true)
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      const buddyPins: BuddyPin[] = (buddyLocations || []).map((b: any) => ({
        id: b.id,
        name: b.profile.full_name,
        city: b.location_city,
        lat: b.latitude,
        lng: b.longitude,
        is_online: b.profile.is_online,
        languages: b.languages,
      }))
      setBuddies(buddyPins)

      // Load location_updates for tourists
      try {
        const { data: locs } = await supabase
          .from('location_updates')
          .select('*, profile:profiles(*)')
          .order('updated_at', { ascending: false })
          .limit(50)

        // Deduplicate by user, taking latest
        const seen = new Set()
        const touristPins: BuddyPin[] = []
        for (const l of locs || []) {
          if (seen.has(l.user_id)) continue
          if (l.profile?.role !== 'tourist') continue
          seen.add(l.user_id)
          touristPins.push({
            id: l.user_id,
            name: l.profile.full_name,
            city: '',
            lat: l.latitude,
            lng: l.longitude,
            is_online: true,
            languages: [],
          })
        }
        setTourists(touristPins)
      } catch {
        // location_updates might not be accessible — ignore
      }
    }
    load()
  }, [])

  // Update my own location
  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return

    const updateLocation = async () => {
      navigator.geolocation.getCurrentPosition(async (pos) => {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        await supabase.from('location_updates').insert({
          user_id: user.id,
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
        })
      }, undefined, { enableHighAccuracy: true })
    }
    updateLocation()
  }, [])

  function FlyToUser() {
    const map = useMap()
    useEffect(() => {
      map.setView([userLocation.lat, userLocation.lng], 13)
    }, [])
    return null
  }

  // Custom icons
  const userIcon = L.divIcon({
    html: '<div style="width:24px;height:24px;background:#4dd0e1;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">★</div>',
    iconSize: [24, 24],
    className: '',
  })

  const buddyIcon = L.divIcon({
    html: '<div style="width:32px;height:32px;background:#FF6B35;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">●</div>',
    iconSize: [32, 32],
    className: '',
  })

  const touristIcon = L.divIcon({
    html: '<div style="width:28px;height:28px;background:#17A2B8;border:3px solid white;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">✈</div>',
    iconSize: [28, 28],
    className: '',
  })

  return (
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

      {/* User's current position */}
      <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
        <Popup>
          <strong>Bạn đang ở đây</strong>
        </Popup>
      </Marker>
      <Circle
        center={[userLocation.lat, userLocation.lng]}
        radius={500}
        pathOptions={{ color: '#4dd0e1', fillColor: '#4dd0e1', fillOpacity: 0.2 }}
      />

      {/* Buddies */}
      {buddies.map(b => (
        <Marker key={b.id} position={[b.lat, b.lng]} icon={buddyIcon}>
          <Popup>
            <strong>{b.name}</strong>
            <br />📍 {b.city}
            <br />🗣️ {b.languages.join(', ')}
            <br />{b.is_online ? '🟢 Online' : '⚪ Offline'}
          </Popup>
        </Marker>
      ))}

      {/* Tourists */}
      {tourists.map(t => (
        <Marker key={t.id} position={[t.lat, t.lng]} icon={touristIcon}>
          <Popup>
            <strong>{t.name}</strong>
            <br />🧳 Tourist
          </Popup>
        </Marker>
      ))}
    </MapContainer>
  )
}
