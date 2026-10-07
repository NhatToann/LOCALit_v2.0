// Haversine geodesic distance in kilometers.
// Inputs in decimal degrees. Returns km (>= 0).
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371 // Earth mean radius in km
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(h))
}

// Da Nang urban driving factor: empirical ~1.4x of straight-line distance
// (avoids motorbike shortcuts being under-counted vs Google).
export const DA_NANG_DRIVE_FACTOR = 1.4

// Average urban speed 30 km/h (Da Nang has wide roads but heavy intersections).
export const DA_NANG_AVG_SPEED_KMH = 30

export function driveMinutes(km: number): number {
  if (km <= 0) return 0
  const adjustedKm = km * DA_NANG_DRIVE_FACTOR
  return Math.round((adjustedKm / DA_NANG_AVG_SPEED_KMH) * 60)
}
