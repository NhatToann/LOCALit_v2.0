'use client'

import { useEffect, useMemo, useRef } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { haversineKm, DA_NANG_DRIVE_FACTOR } from '@/lib/haversine'
import type { TripStop, TripDay } from '@/lib/types'

const PRIMARY = '#FF6B35'
const DAY_PALETTE = ['#FF6B35', '#075985', '#166534', '#92400E']

const DA_NANG: [number, number] = [16.0544, 108.2023]

export interface ItineraryMapStop extends Pick<TripStop, 'id' | 'name' | 'latitude' | 'longitude' | 'category' | 'stop_order'> {
  day_id: string | null
  planned_time: string | null
}

interface Props {
  stops: ItineraryMapStop[]
  days: TripDay[]
  onStopClick?: (stopId: string) => void
  onAddPlace?: () => void
}

function pinIcon(idx: number, color: string): L.DivIcon {
  return L.divIcon({
    html: `<div style="width:28px;height:28px;background:${color};border:2px solid #FFFFFF;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-weight:600;font-size:11px;font-family:'Plus Jakarta Sans',system-ui,sans-serif;box-shadow:0 1px 2px rgba(0,0,0,0.25);">${idx}</div>`,
    iconSize: [28, 28],
    className: '',
  })
}

function FitToStops({ stops }: { stops: ItineraryMapStop[] }) {
  const map = useMap()
  useEffect(() => {
    const located = stops.filter((s) => s.latitude !== null && s.longitude !== null)
    if (located.length === 0) {
      map.setView(DA_NANG, 12)
      return
    }
    if (located.length === 1) {
      const s = located[0]
      map.setView([s.latitude!, s.longitude!], 14, { animate: true, duration: 0.5 })
      return
    }
    const bounds = L.latLngBounds(
      located.map((s) => [s.latitude!, s.longitude!] as [number, number])
    )
    map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15, animate: true, duration: 0.5 })
  }, [stops, map])
  return null
}

export default function ItineraryMap({ stops, days, onStopClick, onAddPlace }: Props) {
  const mapRef = useRef<L.Map | null>(null)

  const dayColor = useMemo(() => {
    const m: Record<string, string> = {}
    days.forEach((d, i) => {
      m[d.id] = DAY_PALETTE[i % DAY_PALETTE.length]
    })
    return m
  }, [days])

  const polylines = useMemo(() => {
    return days
      .map((day) => {
        const points = stops
          .filter((s) => s.day_id === day.id && s.latitude !== null && s.longitude !== null)
          .sort((a, b) => a.stop_order - b.stop_order)
          .map((s) => [s.latitude!, s.longitude!] as [number, number])
        if (points.length < 2) return null
        return { dayId: day.id, points }
      })
      .filter((x): x is { dayId: string; points: [number, number][] } => x !== null)
  }, [stops, days])

  // Compute total distance per day (km) for day color hint in polylines
  const totalKm = useMemo(() => {
    let sum = 0
    for (const line of polylines) {
      for (let i = 0; i < line.points.length - 1; i++) {
        sum += haversineKm({ lat: line.points[i][0], lng: line.points[i][1] }, { lat: line.points[i + 1][0], lng: line.points[i + 1][1] })
      }
    }
    return sum
  }, [polylines])

  return (
    <section
      className="relative w-full border border-border rounded-sm overflow-hidden bg-surface"
      aria-label="Itinerary map"
    >
      <div className="h-[60vh] min-h-[360px] w-full">
        <MapContainer
          center={DA_NANG}
          zoom={12}
          style={{ height: '100%', width: '100%' }}
          ref={(m) => {
            if (m) mapRef.current = m
          }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitToStops stops={stops} />
          {polylines.map((line) => (
            <Polyline
              key={line.dayId}
              positions={line.points}
              pathOptions={{
                color: dayColor[line.dayId] ?? PRIMARY,
                weight: 3,
                opacity: 0.7,
                dashArray: '6 6',
              }}
            />
          ))}
          {stops.map((s, i) => {
            if (s.latitude === null || s.longitude === null) return null
            const dayKey = s.day_id ?? ''
            const color = dayColor[dayKey] ?? PRIMARY
            return (
              <Marker
                key={s.id}
                position={[s.latitude, s.longitude]}
                icon={pinIcon(i + 1, color)}
                eventHandlers={
                  onStopClick
                    ? {
                        click: () => onStopClick(s.id),
                      }
                    : undefined
                }
              />
            )
          })}
        </MapContainer>
      </div>

      {onAddPlace ? (
        <button
          type="button"
          onClick={onAddPlace}
          className="absolute top-3 right-3 z-[400] inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover shadow-focus"
          aria-label="Add a place to the itinerary"
        >
          + Add place
        </button>
      ) : null}

      {stops.length > 0 ? (
        <p className="px-3 py-1.5 text-[11px] text-muted border-t border-border bg-paper">
          {stops.filter((s) => s.latitude !== null).length} of {stops.length} stops pinned ·{' '}
          {totalKm.toFixed(1)} km straight-line (×{DA_NANG_DRIVE_FACTOR} for drive estimate)
        </p>
      ) : null}
    </section>
  )
}
