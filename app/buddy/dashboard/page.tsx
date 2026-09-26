'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import dynamic from 'next/dynamic'
import { createClient } from '@/utils/supabase/auth'
import { Clock, Check, Briefcase, Star, Inbox, Pencil, MessageCircle, MapPin, Compass, DollarSign, Eye, ClipboardList } from 'lucide-react'
import type { Profile, Connection, Trip } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { EmptyState } from '@/components/ui/Avatar'

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false })

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 }

export default function BuddyDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [buddyProfile, setBuddyProfile] = useState<any | null>(null)
  const [requests, setRequests] = useState<Connection[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [reviewsCount, setReviewsCount] = useState(0)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION)

  useEffect(() => {
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setLoading(false)
          return
        }

        const [
          { data: p },
          { data: c },
          { data: t },
          { data: b },
          { data: myReviews },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase
            .from('connections')
            .select('*, tourist:tourists(*, profile:profiles(*))')
            .eq('buddy_id', user.id)
            .order('created_at', { ascending: false }),
          supabase
            .from('trips')
            .select('*, tourist:tourists(*, profile:profiles(*))')
            .eq('buddy_id', user.id),
          supabase
            .from('buddies')
            .select('*')
            .eq('id', user.id)
            .maybeSingle(),
          supabase
            .from('reviews')
            .select('rating')
            .eq('reviewee_id', user.id),
        ])

        setProfile(p ?? null)
        setBuddyProfile(b ?? null)
        setRequests((c || []) as Connection[])
        setTrips((t || []) as Trip[])
        setReviewsCount((myReviews || []).length)
        if (myReviews && myReviews.length > 0) {
          const sum = myReviews.reduce((acc, r) => acc + (r.rating || 0), 0)
          setAvgRating(Math.round((sum / myReviews.length) * 10) / 10)
        } else {
          setAvgRating(null)
        }
      } catch (err) {
        // silent — UI shows skeleton during load
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
        () => {},
        { enableHighAccuracy: false, timeout: 4000 },
      )
    }
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
    return <div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>
  }

  const pendingCount = requests.filter(r => r.status === 'pending').length
  const acceptedCount = requests.filter(r => r.status === 'accepted').length
  const upcomingTrips = trips.filter(t => t.status === 'confirmed' || t.status === 'planning').length
  const completedThisMonth = trips.filter(t => t.status === 'completed').length

  // Earnings placeholder: count of completed trips × buddy's hourly_rate.
  // Phase 2 will replace with proper earnings tracker.
  const hourlyRate = buddyProfile?.hourly_rate ?? 0
  const earningsThisMonth = completedThisMonth * hourlyRate

  const firstName = profile?.full_name?.split(' ')[0] || 'buddy'
  const city = buddyProfile?.location_city || 'Da Nang'

  const stats = [
    { label: 'Pending requests', value: pendingCount, icon: Clock, tone: 'warning' as const },
    { label: 'Active connections', value: acceptedCount, icon: Check, tone: 'success' as const },
    { label: 'Upcoming trips', value: upcomingTrips, icon: Briefcase, tone: 'primary' as const },
    {
      label: 'Avg rating',
      value: avgRating !== null ? `${avgRating.toFixed(1)}` : '—',
      subtitle: avgRating !== null ? `${reviewsCount} review${reviewsCount === 1 ? '' : 's'}` : 'No reviews yet',
      icon: Star,
      tone: 'info' as const,
    },
  ]

  return (
    <div className="container-page py-8 lg:py-12">
      {/* Hero */}
      <section
        aria-labelledby="buddy-hero-title"
        className="mb-8 pb-8 border-b border-border"
      >
        <p className="text-eyebrow text-primary mb-3">Local buddy dashboard</p>
        <h1 id="buddy-hero-title" className="text-page-title mb-3">
          Hi {firstName}
        </h1>
        <p className="text-base text-muted mb-6 max-w-2xl">
          {pendingCount > 0
            ? `You have ${pendingCount} pending ${pendingCount === 1 ? 'request' : 'requests'} waiting for your reply.`
            : `You are all caught up. Time to plan something fun in ${city}.`}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            onClick={toggleAvailability}
            disabled={toggling}
            className={`inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm border transition-colors duration-150 ${
              profile?.is_online
                ? 'bg-success-bg text-success border-success-bg hover:bg-success hover:text-paper'
                : 'bg-transparent text-ink border-border-strong hover:bg-paper'
            }`}
            aria-pressed={profile?.is_online ?? false}
          >
            <span
              className={`w-2 h-2 rounded-full ${profile?.is_online ? 'bg-success animate-pulse' : 'bg-subtle'}`}
              aria-hidden="true"
            />
            {profile?.is_online ? 'Accepting requests' : 'Currently offline'}
          </button>
          <Link
            href={`/tourist/buddy/${profile?.id}`}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <Eye size={16} aria-hidden="true" />
            View public profile
          </Link>
          <Link
            href="/buddy/profile"
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-muted hover:text-ink border border-transparent"
          >
            <Pencil size={16} aria-hidden="true" />
            Edit profile
          </Link>
        </div>
      </section>

      {/* Stats */}
      <section aria-label="Buddy stats" className="mb-8">
        <h2 className="sr-only">Your stats</h2>
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {stats.map((s, i) => {
            const Icon = s.icon
            const toneClasses = {
              primary: 'text-primary',
              success: 'text-success',
              warning: 'text-warning',
              info: 'text-info',
            }
            return (
              <li key={i} className="border border-border rounded-sm p-4 bg-surface">
                <div className={`mb-3 ${toneClasses[s.tone]}`}>
                  <Icon size={20} aria-hidden="true" />
                </div>
                <p className="text-2xl font-semibold text-ink">{s.value}</p>
                <p className="text-xs text-muted mt-0.5">{s.label}</p>
                {s.subtitle ? <p className="text-xs text-muted">{s.subtitle}</p> : null}
              </li>
            )
          })}
        </ul>
      </section>

      {/* Earnings placeholder (per role-differentiation-plan Phase 1) */}
      <section
        aria-labelledby="earnings-title"
        className="mb-8 border border-border rounded-sm p-6 bg-surface"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 id="earnings-title" className="text-section-title mb-1">
              Earnings this month
            </h2>
            <p className="text-sm text-muted">
              Based on {completedThisMonth} completed {completedThisMonth === 1 ? 'trip' : 'trips'} at ${hourlyRate}/hour.
              Phase 2 will add weekly trend charts.
            </p>
          </div>
          <DollarSign size={28} className="text-primary" aria-hidden="true" />
        </div>
        <p className="text-4xl font-semibold text-ink mt-4">
          ${earningsThisMonth.toFixed(0)}
          <span className="text-sm font-normal text-muted ml-1">USD estimated</span>
        </p>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pending requests */}
        <section className="border border-border rounded-sm bg-surface" aria-labelledby="requests-title">
          <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 id="requests-title" className="text-lg font-semibold">
                Connection requests
              </h2>
              <p className="text-sm text-muted">Tourists who want to explore with you.</p>
            </div>
            <Link href="/buddy/requests" className="text-sm text-primary hover:underline">
              Manage all
            </Link>
          </header>
          <div className="p-6">
            {requests.filter(r => r.status === 'pending').length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No pending requests right now"
                description="When travelers reach out, they will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {requests.filter(r => r.status === 'pending').slice(0, 5).map(r => {
                  const t = r.tourist as any
                  const name = t?.profile?.full_name || 'Traveler'
                  return (
                    <li key={r.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={name} size="md" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted truncate">
                            {t?.nationality || '—'} · {t?.destination || 'Da Nang'}
                          </p>
                          {r.message ? (
                            <p className="text-xs text-muted italic mt-1 line-clamp-2">
                              &ldquo;{r.message}&rdquo;
                            </p>
                          ) : null}
                        </div>
                      </div>
                      <Link
                        href="/buddy/requests"
                        className="inline-flex items-center h-8 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                      >
                        Review
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* Upcoming trips */}
        <section className="border border-border rounded-sm bg-surface" aria-labelledby="upcoming-title">
          <header className="px-6 py-4 border-b border-border">
            <h2 id="upcoming-title" className="text-lg font-semibold">
              Upcoming trips
            </h2>
            <p className="text-sm text-muted">Trips you are guiding.</p>
          </header>
          <div className="p-6">
            {trips.length === 0 ? (
              <EmptyState
                icon={Compass}
                title="No trips booked yet"
                description="Accept a request to start planning."
              />
            ) : (
              <ul className="divide-y divide-border">
                {trips.slice(0, 5).map((trip) => {
                  const t = trip.tourist as any
                  const name = t?.profile?.full_name || 'Traveler'
                  const tone =
                    trip.status === 'completed'
                      ? 'info'
                      : trip.status === 'confirmed'
                        ? 'success'
                        : trip.status === 'cancelled'
                          ? 'danger'
                          : 'warning'
                  return (
                    <li key={trip.id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{trip.title}</p>
                        <p className="text-xs text-muted mt-0.5 truncate">
                          {trip.destination}
                          {trip.start_date ? ` · ${new Date(trip.start_date).toLocaleDateString('en-US')}` : ''}
                        </p>
                        <p className="text-xs text-muted mt-0.5 truncate">{name}</p>
                      </div>
                      <span className={`badge badge-${tone}`}>{trip.status}</span>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      {/* Quick actions */}
      <section className="mt-6" aria-label="Quick actions">
        <h2 className="text-lg font-semibold mb-3">Quick actions</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <li>
            <Link
              href="/buddy/requests"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="text-muted mt-0.5">
                <Inbox size={20} aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-sm font-semibold">Review requests</strong>
                <small className="block text-xs text-muted mt-0.5">{pendingCount} pending</small>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/buddy/profile"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="text-muted mt-0.5">
                <ClipboardList size={20} aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-sm font-semibold">Complete your profile</strong>
                <small className="block text-xs text-muted mt-0.5">Bio, specialties, hourly rate</small>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/chat"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="text-muted mt-0.5">
                <MessageCircle size={20} aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-sm font-semibold">Messages</strong>
                <small className="block text-xs text-muted mt-0.5">Chat with active tourists</small>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/map"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="text-muted mt-0.5">
                <MapPin size={20} aria-hidden="true" />
              </span>
              <span>
                <strong className="block text-sm font-semibold">Pin my location</strong>
                <small className="block text-xs text-muted mt-0.5">Show up on the buddy map</small>
              </span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  )
}
