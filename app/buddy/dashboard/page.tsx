'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { Profile, Connection, Trip } from '@/lib/types'

export default function BuddyDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [requests, setRequests] = useState<Connection[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const [{ data: p }, { data: c }, { data: t }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase.from('connections').select('*, tourist:tourists(*, profile:profiles(*))').eq('buddy_id', user.id).order('created_at', { ascending: false }),
          supabase.from('trips').select('*, tourist:tourists(*, profile:profiles(*))').eq('buddy_id', user.id),
        ])

        setProfile(p ?? null)
        setRequests((c || []) as Connection[])
        setTrips((t || []) as Trip[])
      } catch (err) {
        console.error('Buddy dashboard load failed:', err)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function toggleAvailability() {
    if (!profile) return
    setToggling(true)
    const supabase = createClient()
    const newStatus = !profile.is_online
    await supabase.from('profiles').update({ is_online: newStatus, last_seen: new Date().toISOString() }).eq('id', profile.id)
    setProfile({ ...profile, is_online: newStatus })
    setToggling(false)
  }

  if (loading) {
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const stats = [
    { label: 'Pending requests', value: pendingCount, icon: '⏳', color: '#FFC107' },
    { label: 'Connections', value: requests.filter(r => r.status === 'accepted').length, icon: '✓', color: '#28A745' },
    { label: 'Trips', value: trips.length, icon: '🧳', color: '#FF6B35' },
    { label: 'Avg rating', value: '—', icon: '⭐', color: '#FFB347' },
  ]

  return (
    <div className="container py-xl">
      <div className="flex-between mb-xl">
        <div>
          <h1 className="text-3xl">Hi {profile?.full_name?.split(' ')[0]}! 👋</h1>
          <p className="text-muted">Manage your connection requests and upcoming trips</p>
        </div>
        <button
          onClick={toggleAvailability}
          disabled={toggling}
          className={`btn ${profile?.is_online ? 'btn-primary' : 'btn-outline'}`}
        >
          {profile?.is_online ? '🟢 Active' : '⚪ Offline'}
        </button>
      </div>

      <div className="grid grid-4 mb-xl">
        {stats.map((s, i) => (
          <div key={i} className="card">
            <div className="card-body flex items-center gap-md">
              <div style={{
                width: 56, height: 56, borderRadius: 16,
                background: `${s.color}20`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 28,
              }}>{s.icon}</div>
              <div>
                <p className="text-2xl font-bold">{s.value}</p>
                <p className="text-sm text-muted">{s.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="grid" style={{ gridTemplateColumns: '2fr 1fr', gap: 'var(--space-lg)' }}>
        {/* Pending requests */}
        <div className="card">
          <div className="card-header flex-between">
            <h3>Connection requests</h3>
            <Link href="/buddy/requests" className="text-primary text-sm">See all →</Link>
          </div>
          <div className="card-body">
            {requests.filter(r => r.status === 'pending').length === 0 ? (
              <div className="empty-state">
                <p>📭 No pending requests right now</p>
              </div>
            ) : (
              <ul className="flex flex-col">
                {requests.filter(r => r.status === 'pending').map(r => {
                  const t = r.tourist as any
                  return (
                    <li key={r.id} className="flex-between py-md" style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <div className="flex items-center gap-sm">
                        <div className="avatar avatar-md">{t?.profile?.full_name?.charAt(0) || '?'}</div>
                        <div>
                          <p className="font-medium">{t?.profile?.full_name}</p>
                          <p className="text-xs text-muted">{t?.nationality || '—'} • {t?.destination || 'Da Nang'}</p>
                          {r.message && <p className="text-sm mt-xs" style={{ fontStyle: 'italic' }}>&ldquo;{r.message}&rdquo;</p>}
                        </div>
                      </div>
                      <Link href="/buddy/requests" className="btn btn-primary btn-sm">Review</Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Quick actions */}
        <div className="card">
          <div className="card-header">
            <h3>Quick actions</h3>
          </div>
          <div className="card-body flex flex-col gap-md">
            <Link href="/buddy/profile" className="btn btn-outline btn-block">
              ✏️ Update profile
            </Link>
            <Link href="/chat" className="btn btn-outline btn-block">
              💬 Messages
            </Link>
            <Link href="/map" className="btn btn-outline btn-block">
              📍 My location
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
