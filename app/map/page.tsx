'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import Link from 'next/link'
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
}

export default function MapPage() {
  const [buddies, setBuddies] = useState<BuddyMarker[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [shareLocation, setShareLocation] = useState(false)
  const [signedIn, setSignedIn] = useState(false)

  const userLocation = useLocationWatcher({
    onGranted: () => setSignedIn(true),
    onDenied: () => setSignedIn(false),
    writeToDb: false,
  })

  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: shareLocation,
  })

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('buddies')
        .select('id, location_city, latitude, longitude, languages, hourly_rate, profile:profiles(full_name, is_online)')
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
            is_online: b.profile?.is_online ?? false,
          }))
        setBuddies(mapped)
      }
    }
    load()
  }, [])

  const selected = buddies.find((b) => b.id === selectedId)

  return (
    <div className="container py-xl">
      <div className="flex-between mb-lg" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 className="text-3xl">Buddy Map — Da Nang</h1>
          <p className="text-muted mt-sm">
            {buddies.length} buddies shown on the map
            {selfGranted
              ? ' · 📍 Sharing your live location'
              : selfDenied
                ? ' · ⚠️ Location permission denied'
                : ' · Location sharing off'}
            {liveLocations.length > 0 && ` · ${liveLocations.length} live tourist${liveLocations.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <div className="flex gap-sm">
          <button
            type="button"
            className={`btn ${shareLocation ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => {
              if (!signedIn) {
                setError('Please sign in to share your live location.')
                return
              }
              setError('')
              setShareLocation(v => !v)
            }}
            title="Opt-in: share your location with other tourists on this map"
          >
            {shareLocation ? '📍 Sharing live' : '📍 Share my location'}
          </button>
          <Link href="/tourist/browse" className="btn btn-outline">List view</Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-error mb-md"><span>⚠️</span><span>{error}</span></div>
      )}

      <div style={{
        height: 'calc(100vh - var(--header-height) - 200px)',
        minHeight: 500,
        borderRadius: 'var(--border-radius-lg)',
        overflow: 'hidden',
        boxShadow: 'var(--shadow)',
        position: 'relative',
      }}>
        <MapView
          userLocation={userLocation}
          height="100%"
          onSelectBuddy={(id) => setSelectedId(id)}
          liveLocations={liveLocations}
          selfLiveOverride={selfGranted}
        />

        {/* Legend */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16, zIndex: 500,
          background: 'white', padding: '10px 14px', borderRadius: 8,
          boxShadow: 'var(--shadow-md)', fontSize: 13,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#FF6B35', display: 'inline-block' }} />
            <span>Local Buddy</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#17A2B8', display: 'inline-block' }} />
            <span>Tourist (saved)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#3b82f6', display: 'inline-block' }} />
            <span>Live tourist (no DB)</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#4dd0e1', display: 'inline-block' }} />
            <span>You</span>
          </div>
        </div>

        {/* Selected popup */}
        {selected && (
          <div style={{
            position: 'absolute', top: 16, right: 16, zIndex: 500,
            width: 280, background: 'white', borderRadius: 'var(--border-radius-lg)',
            boxShadow: 'var(--shadow-lg)', padding: 'var(--space-md)',
          }}>
            <button
              type="button"
              onClick={() => setSelectedId(null)}
              aria-label="Close"
              style={{ position: 'absolute', top: 8, right: 8, background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 18, width: 28, height: 28, borderRadius: '50%' }}
            >✕</button>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
              <span className="avatar avatar-lg">{selected.name.charAt(0)}</span>
              <div>
                <h4>{selected.name}</h4>
                <p className="text-sm text-muted">📍 {selected.city}</p>
              </div>
            </div>
            <div style={{ marginBottom: 12, fontSize: 13 }}>
              🗣️ {selected.languages.slice(0, 3).join(', ')}
            </div>
            <div className="flex gap-sm">
              <Link href={`/tourist/buddy/${selected.id}`} className="btn btn-primary btn-sm flex-1" style={{ flex: 1 }}>
                Profile
              </Link>
              <Link href={`/chat?buddy=${selected.id}`} className="btn btn-outline btn-sm" style={{ flex: 1 }}>
                💬 Message
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
