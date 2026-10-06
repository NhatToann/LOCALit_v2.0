import { haversineKm, driveMinutes } from './haversine'
import type { TripStop, TripDay } from './types'

export interface DayInsight {
  dayId: string
  stopCount: number
  distanceKm: number
  driveMinutes: number
  overloaded: boolean // > 5 stops
}

export interface Insights {
  totalKm: number
  totalDriveMinutes: number
  perDay: DayInsight[]
  overloadedDayCount: number
}

/**
 * Compute operational insights for a trip from stops + days.
 * Pure function. No I/O, no AI.
 */
export function computeInsights(days: TripDay[], stops: TripStop[]): Insights {
  const perDay: DayInsight[] = days.map((day) => {
    const dayStops = stops
      .filter((s) => s.day_id === day.id && s.latitude !== null && s.longitude !== null)
      .sort((a, b) => a.stop_order - b.stop_order)
    let km = 0
    for (let i = 0; i < dayStops.length - 1; i++) {
      km += haversineKm(
        { lat: dayStops[i].latitude!, lng: dayStops[i].longitude! },
        { lat: dayStops[i + 1].latitude!, lng: dayStops[i + 1].longitude! },
      )
    }
    return {
      dayId: day.id,
      stopCount: dayStops.length,
      distanceKm: km,
      driveMinutes: driveMinutes(km),
      overloaded: dayStops.length > 5,
    }
  })
  const totalKm = perDay.reduce((s, d) => s + d.distanceKm, 0)
  const totalDriveMinutes = perDay.reduce((s, d) => s + d.driveMinutes, 0)
  return {
    totalKm,
    totalDriveMinutes,
    perDay,
    overloadedDayCount: perDay.filter((d) => d.overloaded).length,
  }
}
