'use client'

import { useEffect, useState } from 'react'
import { Search, MapPin, X, Plus, Loader2 } from 'lucide-react'
import { cachedFetch } from '@/lib/osm-cache'
import { haversineKm } from '@/lib/haversine'

export interface PickedLocation {
  lat: number
  lng: number
  address: string
  name?: string
  osm_id?: number
  osm_type?: string
  category?: string
}

export interface NominatimResult {
  place_id: number
  lat: string
  lon: string
  display_name: string
  name?: string
  type?: string
  category?: string
  extratags?: Record<string, string>
}

interface Props {
  open: boolean
  initialQuery?: string
  center: { lat: number; lng: number }
  onPick: (loc: PickedLocation) => void
  onClose: () => void
}

export default function PlacePickerSheet({ open, initialQuery = '', center, onPick, onClose }: Props) {
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState<NominatimResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) setQuery(initialQuery)
  }, [open, initialQuery])

  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  useEffect(() => {
    if (!open) return
    const q = query.trim()
    if (q.length < 3) {
      setResults([])
      return
    }
    const t = setTimeout(async () => {
      setLoading(true)
      setError(null)
      try {
        const fullQuery = `${q}, Da Nang, Vietnam`
        const data = await cachedFetch<NominatimResult[]>(fullQuery, async () => {
          const url = `https://nominatim.openstreetmap.org/search?format=json&limit=8&q=${encodeURIComponent(fullQuery)}&addressdetails=1&extratags=1`
          const res = await fetch(url, { headers: { 'Accept-Language': 'en' } })
          if (!res.ok) throw new Error(`HTTP ${res.status}`)
          return (await res.json()) as NominatimResult[]
        })
        setResults(data)
        if (data.length === 0) setError('No match. Try a landmark (e.g. "Marble Mountains", "Han Market").')
      } catch (e) {
        setError('Search failed. Check your connection.')
      } finally {
        setLoading(false)
      }
    }, 300)
    return () => clearTimeout(t)
  }, [query, open])

  if (!open) return null

  function handlePick(r: NominatimResult) {
    onPick({
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
      address: r.display_name,
      name: r.name ?? r.display_name.split(',')[0],
      osm_id: r.place_id,
      osm_type: r.category ?? r.type,
      category: r.type,
    })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Search a place in Da Nang"
      className="fixed inset-0 z-[2000] bg-paper/80 flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-md bg-surface border border-border rounded-t-sm sm:rounded-sm shadow-focus flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-2 px-4 py-3 border-b border-border">
          <Search size={14} className="text-muted" aria-hidden="true" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search Da Nang landmark, address, place…"
            aria-label="Search address"
            autoFocus
            className="flex-1 bg-transparent text-base text-ink placeholder:text-muted focus:outline-none"
          />
          {loading ? (
            <Loader2 size={14} className="text-muted animate-spin" aria-hidden="true" />
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="text-muted hover:text-ink p-1"
          >
            <X size={14} aria-hidden="true" />
          </button>
        </header>

        <div className="overflow-y-auto flex-1">
          {error ? (
            <p className="px-4 py-3 text-xs text-danger" role="alert">
              {error}
            </p>
          ) : null}

          {results.length === 0 && !loading && !error ? (
            <div className="px-4 py-6 text-xs text-muted text-center">
              Type at least 3 characters. Results come from OpenStreetMap.
            </div>
          ) : null}

          <ul className="divide-y divide-border">
            {results.map((r) => {
              const lat = parseFloat(r.lat)
              const lng = parseFloat(r.lon)
              const dist = haversineKm(center, { lat, lng })
              return (
                <li key={r.place_id}>
                  <button
                    type="button"
                    onClick={() => handlePick(r)}
                    className="w-full text-left px-4 py-2.5 hover:bg-paper focus:bg-paper focus:outline-none"
                  >
                    <div className="flex items-start gap-2">
                      <MapPin size={12} className="text-primary mt-0.5 flex-shrink-0" aria-hidden="true" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-ink truncate">
                          {r.name ?? r.display_name.split(',')[0]}
                        </p>
                        <p className="text-[11px] text-muted line-clamp-1">{r.display_name}</p>
                        <p className="text-[10px] text-subtle mt-0.5">
                          {dist.toFixed(1)} km from map center
                          {r.category ? ` · ${r.category}` : ''}
                        </p>
                      </div>
                      <Plus size={12} className="text-muted mt-1 flex-shrink-0" aria-hidden="true" />
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        <footer className="px-4 py-2 border-t border-border bg-paper text-[10px] text-subtle">
          Search results © OpenStreetMap contributors. Cached 7 days on this device.
        </footer>
      </div>
    </div>
  )
}
