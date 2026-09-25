'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/utils/supabase/auth'
import BuddyCard from '@/components/buddy/BuddyCard'

interface BuddyData {
  id: string
  location_city: string
  latitude: number
  longitude: number
  languages: string[]
  specialties: string[]
  hourly_rate: number
  rating_avg: number
  bio: string | null
  is_available: boolean
  profile: {
    id: string
    full_name: string
    avatar_url: string | null
  }
}

export default function BrowseBuddiesPage() {
  const [buddies, setBuddies] = useState<BuddyData[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterCity, setFilterCity] = useState('')
  const [filterLang, setFilterLang] = useState('')
  const [sortBy, setSortBy] = useState<'rating' | 'price' | 'recent'>('rating')

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data } = await supabase
        .from('buddies')
        .select('*, profile:profiles(*)')
        .eq('is_available', true)
      setBuddies((data as BuddyData[]) || [])
      setLoading(false)
    }
    load()
  }, [])

  // Derived list of unique cities
  const cities = [...new Set(buddies.map(b => b.location_city))]
  const languages = [...new Set(buddies.flatMap(b => b.languages))]

  const filtered = buddies
    .filter(b => {
      if (filterCity && b.location_city !== filterCity) return false
      if (filterLang && !b.languages.includes(filterLang)) return false
      if (search) {
        const q = search.toLowerCase()
        const hay = `${b.profile.full_name} ${b.location_city} ${b.bio} ${b.specialties.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
    .sort((a, b) => {
      if (sortBy === 'rating') return b.rating_avg - a.rating_avg
      if (sortBy === 'price') return a.hourly_rate - b.hourly_rate
      return 0
    })

  if (loading) {
    return (
      <div className="container py-xl text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  return (
    <div className="container py-xl">
      <div className="mb-xl">
        <h1 className="text-3xl font-bold">Tìm Local Buddy</h1>
        <p className="text-muted mt-sm">{buddies.length} buddy đang sẵn sàng khám phá cùng bạn</p>
      </div>

      {/* Search + Filters */}
      <div className="card mb-lg">
        <div className="card-body">
          <div className="grid grid-4" style={{ gap: 'var(--space-md)' }}>
            <input
              type="search"
              className="form-input"
              placeholder="🔍 Tìm theo tên, thành phố, sở thích..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select className="form-input form-select" value={filterCity} onChange={(e) => setFilterCity(e.target.value)}>
              <option value="">Tất cả thành phố</option>
              {cities.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="form-input form-select" value={filterLang} onChange={(e) => setFilterLang(e.target.value)}>
              <option value="">Tất cả ngôn ngữ</option>
              {languages.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select className="form-input form-select" value={sortBy} onChange={(e) => setSortBy(e.target.value as any)}>
              <option value="rating">⭐ Đánh giá cao nhất</option>
              <option value="price">💰 Giá thấp nhất</option>
            </select>
          </div>
        </div>
      </div>

      {/* Results */}
      {filtered.length === 0 ? (
        <div className="empty-state">
          <p className="text-lg">😔 Không tìm thấy buddy nào phù hợp</p>
          <p className="text-sm text-muted mt-sm">Thử thay đổi bộ lọc của bạn</p>
        </div>
      ) : (
        <>
          <p className="text-sm text-muted mb-md">{filtered.length} kết quả</p>
          <div className="grid grid-auto stagger">
            {filtered.map(buddy => (
              <BuddyCard
                key={buddy.id}
                id={buddy.id}
                name={buddy.profile.full_name}
                location_city={buddy.location_city}
                rating_avg={buddy.rating_avg}
                hourly_rate={buddy.hourly_rate}
                languages={buddy.languages}
                specialties={buddy.specialties}
                avatar_url={buddy.profile.avatar_url}
                is_available={buddy.is_available}
                bio={buddy.bio}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
