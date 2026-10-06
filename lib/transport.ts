import {
  Footprints,
  Bike,
  Car,
  Bus,
  Ship,
  TramFront,
  Truck,
  type LucideIcon,
} from 'lucide-react'

// Single enum used by both buddies.transport (default) and
// itinerary_stops.transport (per-stop override). Keep in sync with
// the CHECK constraints in supabase/migrations/2026-09-27-buddy-transport.sql
// and 2026-10-07-unified-itinerary-*.sql.
export type Transport =
  | 'walk'
  | 'scooter'
  | 'taxi'
  | 'bike'
  | 'car'
  | 'bus'
  | 'boat'
  | 'grab'
  | 'cyclo'
  | 'other'

export const TRANSPORT_LIST: Transport[] = [
  'walk',
  'scooter',
  'taxi',
  'bike',
  'car',
  'bus',
  'boat',
  'grab',
  'cyclo',
  'other',
]

export const TRANSPORT_LABEL: Record<Transport, string> = {
  walk: 'Walk',
  scooter: 'Scooter',
  taxi: 'Taxi',
  bike: 'Bike',
  car: 'Car',
  bus: 'Bus',
  boat: 'Boat',
  grab: 'Grab',
  cyclo: 'Cyclo',
  other: 'Other',
}

export const TRANSPORT_ICONS: Record<Transport, LucideIcon> = {
  walk: Footprints,
  scooter: Bike,
  taxi: Car,
  bike: Bike,
  car: Car,
  bus: Bus,
  boat: Ship,
  grab: Truck,
  cyclo: TramFront,
  other: TramFront,
}

// Used as the fallback when neither the buddy profile nor the stop have a
// transport set. Walking is the lowest-friction default for travel planning.
export const TRANSPORT_DEFAULT: Transport = 'walk'

/**
 * Given the per-stop transport (may be null/undefined) and the buddy
 * default (may be null/undefined), returns the effective transport icon
 * and label for rendering.
 */
export function effectiveTransport(
  perStop: string | null | undefined,
  buddyDefault: string | null | undefined,
): Transport {
  if (perStop && isTransport(perStop)) return perStop
  if (buddyDefault && isTransport(buddyDefault)) return buddyDefault as Transport
  return TRANSPORT_DEFAULT
}

export function isTransport(value: unknown): value is Transport {
  return typeof value === 'string' && (TRANSPORT_LIST as string[]).includes(value)
}
