/**
 * Type contract for search_buddies RPC results.
 * Mirrors the SQL in supabase/migrations/2026-10-02-smart-buddy-search.sql
 * and the shape returned by `search_buddies_facets`.
 */

export interface BuddySearchResult {
  id: string
  full_name: string
  location_city: string
  lat: number
  lng: number
  distance_km: number | null
  match_score: number
  text_score: number
  geo_score: number
  tag_score: number
  avail_score: number
  languages: string[]
  specialties: string[]
  hourly_rate: number | null
  rating_avg: number
  rating_count: number
  is_online: boolean
  is_available: boolean
  avatar_url: string | null
}

export interface FacetCount {
  value: string
  count: number
}

export interface SearchFacets {
  specialties: FacetCount[]
  languages: FacetCount[]
  cities: FacetCount[]
  available: number
  online: number
  total: number
}
