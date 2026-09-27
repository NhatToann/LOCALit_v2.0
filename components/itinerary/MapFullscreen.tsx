'use client'

import { useEffect, useRef, useState } from 'react'
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { Search, MapPin, X, Check } from 'lucide-react'

const PRIMARY = '#FF6B35'

function pinIcon(bg: string, label: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:26px;height:26px;background:${bg};border:2px solid #FFFFFF;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:600;font-size:11px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;">${label}</div>`,
    iconSize: [26, 26],
    className: '',
  })
}

export interface PickedLocation {
  lat: number
  lng: number
  address: string
}

interface Props {
  initialLat?: number
  initialLng?: number
  onPick: (loc: PickedLocation) => void
  onCancel: () => void
}

const DA_NANG: [number, number] = [16.0544, 108.2023]

export default function MapFullscreen({
  initialLat,
  initialLng,
  onPick,
  onCancel,
}: Props) {
  const startCenter: [number, number] = [
    initialLat ?? DA_NANG[0],
    initialLng ?? DA_NANG[1],
  ]
  const [pin, setPin] = useState<PickedLocation | null>(
    initialLat && initialLng
      ? { lat: initialLat, lng: initialLng, address: '' }
      : null,
  )
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mapRef = useRef<L.Map | null>(null)

  async function search(e: React.FormEvent) {
    e.preventDefault()
    const q = query.trim()
    if (!q) return
    setSearching(true)
    setError(null)
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q + ', Da Nang, Vietnam')}`
      const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
      const data: Array<{ lat: string; lon: string; display_name: string }> = await res.json()
      if (data.length === 0) {
        setError('No match. Try a landmark (e.g. "Marble Mountains", "Han Market").')
        return
      }
      const lat = parseFloat(data[0].lat)
      const lng = parseFloat(data[0].lon)
      mapRef.current?.setView([lat, lng], 15)
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
      return data.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    } catch {
      return `${lat.toFixed(5)}, ${lng.toFixed(5)}`
    }
  }

  function ClickPicker() {
    useMapEvents({
      async click(e) {
        const lat = e.latlng.lat
        const lng = e.latlng.lng
        const address = await reverseGeocode(lat, lng)
        setPin({ lat, lng, address })
      },
    })
    return null
  }

  function CaptureMap() {
    const map = useMap()
    useEffect(() => {
      mapRef.current = map
      // Force a resize after mount — guards against the zero-height bug
      // we hit in the sidebar variant.
      setTimeout(() => map.invalidateSize(), 100)
    }, [map])
    return null
  }

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Pick a location"
      className="fixed inset-0 z-[2000] bg-paper flex flex-col"
    >
      {/* Header */}
      <header className="border-b border-border bg-surface px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[240px]">
          <p className="text-eyebrow text-muted mb-1">Pick a location</p>
          <form onSubmit={search} className="relative">
            <Search
              size={13}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
              aria-hidden="true"
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Da Nang address or landmark…"
              aria-label="Search address"
              className="w-full pl-8 pr-2 py-1.5 text-sm border border-border rounded-sm bg-paper focus:outline-none focus:border-primary"
            />
          </form>
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="inline-flex items-center gap-1 h-9 px-3 text-sm rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
        >
          <X size={14} aria-hidden="true" /> Cancel
        </button>
        <button
          type="button"
          onClick={() => pin && onPick(pin)}
          disabled={!pin}
          className="inline-flex items-center gap-1 h-9 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Check size={14} aria-hidden="true" /> Use this location
        </button>
      </header>

      {/* Map */}
      <div className="relative flex-1 bg-paper">
        <MapContainer
          center={startCenter}
          zoom={initialLat ? 14 : 13}
          style={{ height: '100%', width: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <CaptureMap />
          <ClickPicker />
          {pin ? (
            <Marker
              position={[pin.lat, pin.lng]}
              icon={pinIcon(PRIMARY, '+')}
            />
          ) : null}
        </MapContainer>

        {/* Status / hint overlay */}
        {!pin ? (
          <div className="absolute top-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-[400] bg-surface border border-border rounded-sm p-3 text-sm shadow-focus">
            <p className="font-semibold mb-1">Click anywhere on the map</p>
            <p className="text-xs text-muted">
              Or use the search box above to jump to a known place in Da Nang.
            </p>
          </div>
        ) : null}

        {/* Picked pin summary */}
        {pin ? (
          <div className="absolute bottom-4 left-4 right-4 md:left-4 md:right-auto md:max-w-md z-[400] bg-surface border border-border rounded-sm p-3 text-sm shadow-focus">
            <div className="flex items-start gap-2">
              <MapPin size={14} className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
              <div className="flex-1 min-w-0">
                <p className="text-ink font-medium line-clamp-2">{pin.address}</p>
                <p className="text-[11px] text-muted font-mono mt-0.5">
                  {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                </p>
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
            {error ? <p className="text-xs text-danger mt-2">{error}</p> : null}
          </div>
        ) : null}

        {searching ? (
          <div className="absolute top-20 right-4 z-[400] bg-surface border border-border rounded-sm px-3 py-2 text-xs flex items-center gap-2 shadow-focus">
            <span className="loading-spinner w-3 h-3" aria-hidden="true" />
            Searching…
          </div>
        ) : null}
      </div>
    </div>
  )
}
