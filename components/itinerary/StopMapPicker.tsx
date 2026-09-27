'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, MapPin, X } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { TripStop } from '@/lib/types'

const PRIMARY = '#FF6B35'
const INK = '#0F0F0F'

// Approximate Da Nang bounding box (used for the "in Da Nang" hint).
const DA_NANG_BBOX = {
  minLat: 15.9,
  maxLat: 16.2,
  minLng: 107.9,
  maxLng: 108.4,
}

function pinIcon(bg: string, label: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:22px;height:22px;background:${bg};border:2px solid #FFFFFF;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:600;font-size:10px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;">${label}</div>`,
    iconSize: [22, 22],
    className: '',
  })
}

interface Props {
  tripId: string
  dayId: string
  dayOrder: number
  existingStops: TripStop[]
  onAdded: (stop: TripStop) => void
  onCancel: () => void
}

interface DraftPin {
  lat: number
  lng: number
  address: string
}

function inDaNang(lat: number, lng: number): boolean {
  return (
    lat >= DA_NANG_BBOX.minLat &&
    lat <= DA_NANG_BBOX.maxLat &&
    lng >= DA_NANG_BBOX.minLng &&
    lng <= DA_NANG_BBOX.maxLng
  )
}

export default function StopMapPicker({
  tripId,
  dayId,
  dayOrder,
  existingStops,
  onAdded,
  onCancel,
}: Props) {
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [pin, setPin] = useState<DraftPin | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [center] = useState<{ lat: number; lng: number }>({ lat: 16.0544, lng: 108.2023 })
  const mapRef = useRef<L.Map | null>(null)

  async function searchAddress(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setError(null)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query + ', Da Nang, Vietnam')}`
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json()
      if (data.length === 0) {
        setError('No match. Try a landmark name (e.g. "Marble Mountains").')
        return
      }
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      mapRef.current?.setView([lat, lng], 14)
      setPin({ lat, lng, address: data[0].display_name })
    } catch {
      setError('Search failed. Check your connection.')
    } finally {
      setSearching(false)
    }
  }

  async function reverseGeocode(lat: number, lng: number): Promise<string> {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=16`
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data: { display_name?: string } = await res.json()
      return data.display_name ?? ''
    } catch {
      return ''
    }
  }

  async function dropPinAt(lat: number, lng: number) {
    const address = await reverseGeocode(lat, lng)
    setPin({ lat, lng, address })
  }

  async function saveStop() {
    if (!pin) return
    setPending(true)
    setError(null)
    const supabase = createClient()
    const orderInDay = existingStops.length
    const { data, error: insErr } = await supabase
      .from('trip_stops')
      .insert({
        trip_id: tripId,
        day_id: dayId,
        stop_order: orderInDay,
        name: pin.address.split(',')[0]?.trim() || 'New stop',
        address: pin.address,
        latitude: pin.lat,
        longitude: pin.lng,
        category: 'sight',
      })
      .select()
      .single()
    setPending(false)
    if (insErr) {
      setError(insErr.message)
      return
    }
    if (data) onAdded(data as TripStop)
  }

  function DropHandler() {
    useMapEvents({
      click(e) {
        dropPinAt(e.latlng.lat, e.latlng.lng)
      },
    })
    return null
  }

  function FlyToOnMount() {
    const map = useMap()
    useEffect(() => {
      mapRef.current = map
      map.setView([center.lat, center.lng], 12)
    }, [map])
    return null
  }

  return (
    <div className="flex flex-col h-full">
      <header className="px-4 py-3 border-b border-border">
        <p className="text-eyebrow text-muted mb-1">Drop pin or search</p>
        <form onSubmit={searchAddress} className="relative">
          <Search
            size={13}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-muted"
            aria-hidden="true"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search a Da Nang address…"
            className="w-full pl-8 pr-2 py-1.5 text-sm border border-border rounded-sm bg-paper focus:outline-none focus:border-primary"
          />
          {searching ? (
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted">
              <span className="loading-spinner w-3 h-3" aria-hidden="true" />
            </span>
          ) : null}
        </form>
        <p className="text-[11px] text-muted mt-2">
          Click anywhere on the map to drop a pin. Search pan-and-pin is faster.
        </p>
      </header>

      <div className="flex-1 min-h-[280px]">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FlyToOnMount />
          <DropHandler />

          {existingStops
            .filter((s) => s.latitude !== null && s.longitude !== null)
            .map((s) => (
              <Marker
                key={s.id}
                position={[s.latitude as number, s.longitude as number]}
                icon={pinIcon('#737373', '•')}
              />
            ))}

          {pin ? (
            <Marker position={[pin.lat, pin.lng]} icon={pinIcon(PRIMARY, '+')}>
              <Popup>
                <strong>New pin</strong>
                <div style={{ fontSize: 12, color: '#737373', marginTop: 2 }}>
                  {pin.address.slice(0, 80)}
                </div>
              </Popup>
            </Marker>
          ) : null}
        </MapContainer>
      </div>

      {pin ? (
        <div className="px-4 py-3 border-t border-border bg-paper space-y-2">
          <div className="flex items-start gap-2">
            <MapPin size={13} className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-ink font-medium line-clamp-2">{pin.address || 'Unknown address'}</p>
              <p className="text-[11px] text-muted font-mono mt-0.5">
                {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
              </p>
              {!inDaNang(pin.lat, pin.lng) ? (
                <p className="text-[11px] text-warning mt-1">
                  Outside Da Nang — still saving, but flag for review.
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setPin(null)}
              aria-label="Clear pin"
              className="text-muted hover:text-danger"
            >
              <X size={12} aria-hidden="true" />
            </button>
          </div>
          {error ? <p className="text-xs text-danger">{error}</p> : null}
          <div className="flex items-center gap-2 justify-end">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 text-xs rounded-sm bg-transparent text-ink border border-border-strong hover:bg-surface"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveStop}
              disabled={pending}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
            >
              {pending ? 'Saving…' : 'Add stop at pin'}
            </button>
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 border-t border-border bg-paper">
          <p className="text-[11px] text-muted">
            No pin yet. Click the map or search an address above.
          </p>
          {error ? <p className="text-xs text-danger mt-1">{error}</p> : null}
          <div className="flex items-center gap-2 justify-end mt-2">
            <button
              type="button"
              onClick={onCancel}
              className="h-8 px-3 text-xs rounded-sm bg-transparent text-ink border border-border-strong hover:bg-surface"
            >
              Close
            </button>
          </div>
        </div>
      )}

      <footer className="px-4 py-2 border-t border-border bg-paper">
        <p className="text-[11px] text-subtle">
          Day {dayOrder + 1} · {existingStops.length} stop{existingStops.length === 1 ? '' : 's'} on the map
        </p>
      </footer>
    </div>
  )
}
