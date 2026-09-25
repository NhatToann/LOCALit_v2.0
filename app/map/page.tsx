'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

export default function MapPage() {
  const [locationAllowed, setLocationAllowed] = useState(false)
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) return

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLocation({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        })
        setLocationAllowed(true)
      },
      () => {
        // Fallback to Da Nang center
        setUserLocation({ lat: 16.0544, lng: 108.2023 })
        setLocationAllowed(true)
      }
    )
  }, [])

  if (!locationAllowed || !userLocation) {
    return (
      <div className="container py-xl text-center">
        <div className="loading-spinner mx-auto" />
        <p className="text-muted mt-md">Đang xác định vị trí của bạn...</p>
      </div>
    )
  }

  return (
    <div className="container py-xl">
      <div className="mb-lg">
        <h1 className="text-3xl font-bold">📍 Bản đồ Buddy</h1>
        <p className="text-muted mt-sm">Xem các buddy và tourist đang hoạt động gần bạn</p>
      </div>

      <div className="card" style={{ height: '70vh', overflow: 'hidden' }}>
        <MapView userLocation={userLocation} />
      </div>

      <div className="mt-lg flex gap-md">
        <Link href="/tourist/browse" className="btn btn-primary">Tìm buddy</Link>
      </div>
    </div>
  )
}
