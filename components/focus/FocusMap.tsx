'use client'

import { useEffect, useRef, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import type { LocationUpdate, Profile } from '@/lib/types'

interface FocusMapProps {
  userAId: string
  userBId: string
  /** Profile (id, full_name, avatar_url) for both users so we can show labels */
  userA: Profile | null
  userB: Profile | null
  /** Optional fixed container height in px (default 320) */
  height?: number
}

const DA_NANG_CENTER = { lat: 16.0544, lng: 108.2022 }

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 6371
  const dLat = ((b.lat - a.lat) * Math.PI) / 180
  const dLng = ((b.lng - a.lng) * Math.PI) / 180
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x))
}

/**
 * Two-user static SVG map. We avoid a full Leaflet instance because the
 * /focus page already has a tabbed UI and we only need to visualise the
 * distance between the two users' last reported coordinates. The map
 * scales to the bounding box plus a 1km margin.
 */
export default function FocusMap({
  userAId,
  userBId,
  userA,
  userB,
  height = 320,
}: FocusMapProps) {
  const [aPos, setAPos] = useState<{ lat: number; lng: number } | null>(null)
  const [bPos, setBPos] = useState<{ lat: number; lng: number } | null>(null)
  const channelRef = useRef<ReturnType<ReturnType<typeof createClient>['channel']> | null>(null)

  useEffect(() => {
    const supabase = createClient()
    let cancelled = false

    async function loadInitial() {
      const [{ data: aRows }, { data: bRows }] = await Promise.all([
        supabase
          .from('location_updates')
          .select('user_id, latitude, longitude, updated_at')
          .eq('user_id', userAId)
          .order('updated_at', { ascending: false })
          .limit(1),
        supabase
          .from('location_updates')
          .select('user_id, latitude, longitude, updated_at')
          .eq('user_id', userBId)
          .order('updated_at', { ascending: false })
          .limit(1),
      ])
      if (cancelled) return
      if (aRows && aRows[0]) setAPos({ lat: aRows[0].latitude, lng: aRows[0].longitude })
      if (bRows && bRows[0]) setBPos({ lat: bRows[0].latitude, lng: bRows[0].longitude })
    }
    void loadInitial()

    // Subscribe to live updates
    const channel = supabase
      .channel(`focus-map-${userAId}-${userBId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'location_updates',
          filter: `user_id=in.(${userAId},${userBId})`,
        },
        (payload) => {
          const row = (payload.new as LocationUpdate) ?? null
          if (!row) return
          if (row.user_id === userAId) setAPos({ lat: row.latitude, lng: row.longitude })
          if (row.user_id === userBId) setBPos({ lat: row.latitude, lng: row.longitude })
        },
      )
      .subscribe()
    channelRef.current = channel

    return () => {
      cancelled = true
      if (channelRef.current) {
        void supabase.removeChannel(channelRef.current)
        channelRef.current = null
      }
    }
  }, [userAId, userBId])

  // Compute bounding box
  const points: { pos: { lat: number; lng: number }; label: string; color: string }[] = []
  if (aPos) points.push({ pos: aPos, label: 'You', color: 'var(--focus-primary)' })
  if (bPos) points.push({ pos: bPos, label: userB?.full_name ?? 'Buddy', color: 'var(--focus-medium)' })

  if (points.length === 0) {
    return (
      <div
        className="bg-focus-bg flex items-center justify-center"
        style={{ height }}
        role="status"
        aria-live="polite"
      >
        <p className="text-sm text-focus-muted">
          Waiting for both users to share their location…
        </p>
      </div>
    )
  }

  // Single point: center on it
  if (points.length === 1) {
    const p = points[0].pos
    return (
      <div
        className="bg-focus-bg relative"
        style={{ height }}
        role="region"
        aria-label="Focus map"
      >
        <SinglePinMap lat={p.lat} lng={p.lng} color={points[0].color} label={points[0].label} />
      </div>
    )
  }

  // Two points: bounding box projection
  const a = aPos!
  const b = bPos!
  const minLat = Math.min(a.lat, b.lat) - 0.01
  const maxLat = Math.max(a.lat, b.lat) + 0.01
  const minLng = Math.min(a.lng, b.lng) - 0.01
  const maxLng = Math.max(a.lng, b.lng) + 0.01
  const width = 100 // SVG viewBox width
  const heightVB = 60 // SVG viewBox height
  const project = (pos: { lat: number; lng: number }) => {
    const x = ((pos.lng - minLng) / (maxLng - minLng)) * width
    const y = (1 - (pos.lat - minLat) / (maxLat - minLat)) * heightVB
    return { x, y }
  }
  const ap = project(a)
  const bp = project(b)
  const distKm = haversineKm(a, b)

  return (
    <div
      className="bg-focus-bg relative"
      style={{ height }}
      role="region"
      aria-label="Focus map"
    >
      <svg
        viewBox={`0 0 ${width} ${heightVB}`}
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        aria-hidden="true"
      >
        {/* Grid lines (flat) */}
        <rect x="0" y="0" width={width} height={heightVB} fill="var(--focus-bg)" />
        {[15, 30, 45].map((y) => (
          <line
            key={`h-${y}`}
            x1="0"
            y1={y}
            x2={width}
            y2={y}
            stroke="var(--focus-border)"
            strokeWidth="0.1"
          />
        ))}
        {[20, 40, 60, 80].map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2={heightVB}
            stroke="var(--focus-border)"
            strokeWidth="0.1"
          />
        ))}
        {/* Connecting line */}
        <line
          x1={ap.x}
          y1={ap.y}
          x2={bp.x}
          y2={bp.y}
          stroke="var(--focus-medium)"
          strokeWidth="0.4"
          strokeDasharray="1,1"
        />
        {/* Pin A */}
        <circle cx={ap.x} cy={ap.y} r="1.2" fill="var(--focus-primary)" />
        <circle cx={ap.x} cy={ap.y} r="0.4" fill="white" />
        {/* Pin B */}
        <circle cx={bp.x} cy={bp.y} r="1.2" fill="var(--focus-medium)" />
        <circle cx={bp.x} cy={bp.y} r="0.4" fill="white" />
      </svg>
      <div className="absolute top-2 left-2 bg-focus-surface border border-focus-border rounded-sm px-2 py-1">
        <p className="text-[10px] uppercase tracking-wide text-focus-muted">Distance</p>
        <p className="text-sm font-semibold text-focus-text tabular-nums">
          {distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(2)} km`}
        </p>
      </div>
      <div className="absolute bottom-2 left-2 flex flex-col gap-1">
        <Legend color="var(--focus-primary)" label={userA?.full_name ?? 'You'} />
        <Legend color="var(--focus-medium)" label={userB?.full_name ?? 'Buddy'} />
      </div>
    </div>
  )
}

function SinglePinMap({
  lat,
  lng,
  color,
  label,
}: {
  lat: number
  lng: number
  color: string
  label: string
}) {
  return (
    <>
      <svg
        viewBox="0 0 100 60"
        preserveAspectRatio="xMidYMid meet"
        className="w-full h-full"
        aria-hidden="true"
      >
        <rect x="0" y="0" width="100" height="60" fill="var(--focus-bg)" />
        {[15, 30, 45].map((y) => (
          <line
            key={`h-${y}`}
            x1="0"
            y1={y}
            x2={100}
            y2={y}
            stroke="var(--focus-border)"
            strokeWidth="0.1"
          />
        ))}
        {[20, 40, 60, 80].map((x) => (
          <line
            key={`v-${x}`}
            x1={x}
            y1="0"
            x2={x}
            y2={60}
            stroke="var(--focus-border)"
            strokeWidth="0.1"
          />
        ))}
        <circle cx="50" cy="30" r="1.5" fill={color} />
        <circle cx="50" cy="30" r="0.6" fill="white" />
      </svg>
      <div className="absolute top-2 left-2 bg-focus-surface border border-focus-border rounded-sm px-2 py-1">
        <p className="text-[10px] uppercase tracking-wide text-focus-muted">Coords</p>
        <p className="text-xs font-mono text-focus-text tabular-nums">
          {lat.toFixed(4)}, {lng.toFixed(4)}
        </p>
      </div>
      <div className="absolute bottom-2 left-2">
        <Legend color={color} label={label} />
      </div>
    </>
  )
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 bg-focus-surface border border-focus-border rounded-sm px-2 py-0.5">
      <span
        className="inline-block w-2 h-2 rounded-full"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />
      <span className="text-xs text-focus-text">{label}</span>
    </span>
  )
}

// Center-exported for unit testing
export { DA_NANG_CENTER, haversineKm }
