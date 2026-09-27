'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  Clock,
  Check,
  Briefcase,
  Star,
  Inbox,
  Pencil,
  MessageCircle,
  MapPin,
  Compass,
  DollarSign,
  Eye,
  ClipboardList,
  Phone,
  Search,
  Plane,
  Utensils,
  Coffee,
  Waves,
  Mountain,
  Sparkles,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Profile, Connection, Trip } from '@/lib/types'
import { Avatar, EmptyState } from '@/components/ui/Avatar'
import { getConnectionStage, daysUntilExpiry, expiryLabel } from '@/lib/connection-stages'
import { labelFor } from '@/lib/specialties'

const PLACE_ICON: Record<string, typeof Waves> = {
  beach: Waves,
  mountain: Mountain,
  river: Waves,
  market: Utensils,
  temple: Sparkles,
  city: Coffee,
  bridge: Waves,
  artisan: Sparkles,
}

function placeIcon(slug: string): typeof Waves {
  const hint = slug.toLowerCase().includes('beach') ? 'beach'
    : slug.toLowerCase().includes('mountain') || slug.toLowerCase().includes('ba-na') || slug.toLowerCase().includes('son-tra') ? 'mountain'
    : slug.toLowerCase().includes('river') || slug.toLowerCase().includes('bridge') ? 'river'
    : slug.toLowerCase().includes('market') ? 'market'
    : slug.toLowerCase().includes('temple') || slug.toLowerCase().includes('pagoda') || slug.toLowerCase().includes('buddha') || slug.toLowerCase().includes('sanctuary') || slug.toLowerCase().includes('cao') ? 'temple'
    : slug.toLowerCase().includes('artisan') || slug.toLowerCase().includes('carving') ? 'artisan'
    : 'city'
  return PLACE_ICON[hint] || MapPin
}

export default function BuddyDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [buddyProfile, setBuddyProfile] = useState<any | null>(null)
  const [requests, setRequests] = useState<Connection[]>([])
  const [trips, setTrips] = useState<Trip[]>([])
  const [reviewsCount, setReviewsCount] = useState(0)
  const [avgRating, setAvgRating] = useState<number | null>(null)
  const [companionsByTrip, setCompanionsByTrip] = useState<Record<string, number>>({})
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

        const [
          { data: p },
          { data: c },
          { data: t },
          { data: b },
          { data: myReviews },
          { data: companions },
        ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
          supabase
            .from('connections')
            .select('*, tourist:tourists(*, profile:profiles(*))')
            .eq('buddy_id', user.id)
            .order('updated_at', { ascending: false }),
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
          supabase
            .from('trip_travelers')
            .select('trip_id, role')
            .in('role', ['companion']),
        ])

        setProfile(p ?? null)
        setBuddyProfile(b ?? null)
        setRequests((c || []) as Connection[])
        setTrips((t || []) as Trip[])
        setReviewsCount((myReviews || []).length)
        const compMap: Record<string, number> = {}
        for (const row of companions || []) {
          compMap[row.trip_id] = (compMap[row.trip_id] || 0) + 1
        }
        setCompanionsByTrip(compMap)
        if (myReviews && myReviews.length > 0) {
          const sum = myReviews.reduce((acc, r) => acc + (r.rating || 0), 0)
          setAvgRating(Math.round((sum / myReviews.length) * 10) / 10)
        } else {
          setAvgRating(null)
        }
      } catch {
        // silent — UI shows skeleton during load
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
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const acceptedConnections = requests.filter((r) => r.status === 'accepted')
  const upcomingTrips = trips.filter((t) => t.status === 'confirmed' || t.status === 'planning')
  const completedThisMonth = trips.filter((t) => t.status === 'completed').length

  const hourlyRate = buddyProfile?.hourly_rate ?? 0
  const earningsThisMonth = completedThisMonth * hourlyRate
  const firstName = profile?.full_name?.split(' ')[0] || 'buddy'
  const city = buddyProfile?.location_city || 'Da Nang'
  const specialties: string[] = buddyProfile?.specialties || []
  const favoritePlaces: string[] = buddyProfile?.favorite_places || []

  return (
    <div className="container-page py-8 lg:py-12 space-y-8">
      {/* ============================================================
          HERO — photo card with greeting + status toggle
          ============================================================ */}
      <section
        aria-labelledby="buddy-hero-title"
        className="relative overflow-hidden border border-border rounded-sm bg-surface"
      >
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1572551562325-b5d5057c9b54?w=1600&q=70&auto=format&fit=crop')",
            opacity: 0.22,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{
            background:
              'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.7) 100%)',
          }}
          aria-hidden="true"
        />
        <div className="relative p-6 lg:p-8 flex flex-col lg:flex-row lg:items-center gap-6">
          <Avatar
            name={profile?.full_name || 'Buddy'}
            src={profile?.avatar_url}
            size="2xl"
            online={profile?.is_online}
          />
          <div className="flex-1 min-w-0">
            <p className="text-eyebrow text-primary mb-2">Local buddy dashboard</p>
            <h1 id="buddy-hero-title" className="text-page-title mb-2">
              Hi {firstName}
            </h1>
            <p className="text-base text-muted mb-4 max-w-xl">
              {pendingRequests.length > 0
                ? `You have ${pendingRequests.length} pending ${pendingRequests.length === 1 ? 'request' : 'requests'} waiting for your reply.`
                : `You are all caught up. Time to plan something fun in ${city}.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={toggleAvailability}
                disabled={toggling}
                aria-pressed={profile?.is_online ?? false}
                className={`inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm border transition-colors duration-150 ${
                  profile?.is_online
                    ? 'bg-success-bg text-success border-success-bg hover:bg-success hover:text-paper'
                    : 'bg-transparent text-ink border-border-strong hover:bg-paper'
                }`}
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
          </div>
        </div>
      </section>

      {/* ============================================================
          STATS — colored icon tiles
          ============================================================ */}
      <section aria-label="Buddy stats">
        <h2 className="sr-only">Your stats</h2>
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: 'Pending requests', value: pendingRequests.length, icon: Clock, tone: 'warning' as const },
            { label: 'Active connections', value: acceptedConnections.length, icon: Check, tone: 'success' as const },
            { label: 'Upcoming trips', value: upcomingTrips.length, icon: Briefcase, tone: 'primary' as const },
            {
              label: 'Avg rating',
              value: avgRating !== null ? `${avgRating.toFixed(1)}` : '—',
              subtitle: avgRating !== null ? `${reviewsCount} review${reviewsCount === 1 ? '' : 's'}` : 'No reviews yet',
              icon: Star,
              tone: 'info' as const,
            },
          ].map((s, i) => {
            const Icon = s.icon
            const toneClasses = {
              primary: 'bg-primary text-paper',
              success: 'bg-success text-paper',
              warning: 'bg-warning text-paper',
              info: 'bg-info text-paper',
            } as const
            return (
              <li
                key={i}
                className="border border-border rounded-sm p-4 bg-surface flex items-start gap-3"
              >
                <span
                  className={`inline-flex items-center justify-center w-10 h-10 rounded-sm ${toneClasses[s.tone]} flex-shrink-0`}
                  aria-hidden="true"
                >
                  <Icon size={18} />
                </span>
                <div className="min-w-0">
                  <p className="text-2xl font-semibold text-ink leading-tight">{s.value}</p>
                  <p className="text-xs text-muted mt-0.5">{s.label}</p>
                  {s.subtitle ? <p className="text-xs text-muted">{s.subtitle}</p> : null}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      {/* ============================================================
          FAVORITE PLACES — what makes this buddy special
          ============================================================ */}
      {favoritePlaces.length > 0 ? (
        <section aria-labelledby="favorites-title" className="border border-border rounded-sm bg-surface p-6">
          <header className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 id="favorites-title" className="text-section-title">
                Favorite places in Da Nang
              </h2>
              <p className="text-sm text-muted mt-1">
                Where you take tourists. Edit anytime from your profile.
              </p>
            </div>
            <Link
              href="/buddy/profile"
              className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <Pencil size={14} aria-hidden="true" />
              Edit
            </Link>
          </header>
          <ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {favoritePlaces.slice(0, 8).map((slug) => {
              const Icon = placeIcon(slug)
              return (
                <li
                  key={slug}
                  className="flex items-center gap-2 border border-border rounded-sm px-3 py-2 bg-paper"
                >
                  <Icon size={14} className="text-primary flex-shrink-0" aria-hidden="true" />
                  <span className="text-xs font-medium text-ink truncate">{labelFor(slug)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      ) : (
        <section className="border border-dashed border-border rounded-sm bg-surface p-6 text-center">
          <MapPin size={28} className="text-primary mx-auto mb-2" aria-hidden="true" />
          <h2 className="text-section-title mb-1">Pin your favorite spots</h2>
          <p className="text-sm text-muted mb-4 max-w-md mx-auto">
            Tourists pick buddies who know the cơm gà stall the locals actually eat at.
            Add 3+ favorite places to make your profile stand out.
          </p>
          <Link
            href="/buddy/profile"
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Pencil size={14} aria-hidden="true" />
            Add favorite places
          </Link>
        </section>
      )}

      {/* ============================================================
          ACTIVE CONNECTIONS — Stage 2 with itinerary & call CTAs
          ============================================================ */}
      <section aria-labelledby="active-title" className="border border-border rounded-sm bg-surface">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 id="active-title" className="text-lg font-semibold">
              Active connections
            </h2>
            <p className="text-sm text-muted">Tourists you are currently guiding.</p>
          </div>
          <span className="badge badge-success">{acceptedConnections.length}</span>
        </header>
        <div className="p-6">
          {acceptedConnections.length === 0 ? (
            <EmptyState
              icon={Plane}
              title="No active connections"
              description="Accept a request below to start guiding a traveler."
            />
          ) : (
            <ul className="divide-y divide-border">
              {acceptedConnections.slice(0, 6).map((r) => {
                const t = r.tourist as any
                const name = t?.profile?.full_name || 'Traveler'
                const stage = getConnectionStage('accepted')
                const daysLeft = daysUntilExpiry(r.updated_at)
                const tripId = trips.find((tt) => tt.tourist_id === r.tourist_id && tt.buddy_id === r.buddy_id)?.id
                const extraTravelers = tripId ? companionsByTrip[tripId] || 0 : 0
                return (
                  <li key={r.id} className="py-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      <Avatar name={name} src={t?.profile?.avatar_url} size="md" online />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate">{name}</p>
                        <p className="text-xs text-muted truncate">
                          {t?.nationality || '—'} · {t?.destination || 'Da Nang'}
                          {extraTravelers > 0 ? ` · +${extraTravelers} co-traveler${extraTravelers === 1 ? '' : 's'}` : ''}
                        </p>
                      </div>
                      <span className={`badge badge-${stage.tone}`}>{stage.label}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 pl-12">
                      <Link
                        href={`/chat?buddy=${r.tourist_id}`}
                        className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                      >
                        <MessageCircle size={12} aria-hidden="true" />
                        Message
                      </Link>
                      <Link
                        href={`/chat?buddy=${r.tourist_id}&call=1`}
                        className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                      >
                        <Phone size={12} aria-hidden="true" />
                        Call
                      </Link>
                      <Link
                        href={`/itinerary/${r.id}`}
                        className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                      >
                        <Compass size={12} aria-hidden="true" />
                        Shared itinerary
                      </Link>
                      <span className="text-xs text-muted ml-auto">{expiryLabel(daysLeft)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* ============================================================
            PENDING REQUESTS — Stage 1
            ============================================================ */}
        <section className="border border-border rounded-sm bg-surface" aria-labelledby="requests-title">
          <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 id="requests-title" className="text-lg font-semibold">
                Connection requests
              </h2>
              <p className="text-sm text-muted">Stage 1 — searching for a buddy.</p>
            </div>
            <Link href="/buddy/requests" className="text-sm text-primary hover:underline">
              Manage all
            </Link>
          </header>
          <div className="p-6">
            {pendingRequests.length === 0 ? (
              <EmptyState
                icon={Inbox}
                title="No pending requests right now"
                description="When travelers reach out, they will appear here."
              />
            ) : (
              <ul className="divide-y divide-border">
                {pendingRequests.slice(0, 5).map((r) => {
                  const t = r.tourist as any
                  const name = t?.profile?.full_name || 'Traveler'
                  const stage = getConnectionStage('pending')
                  return (
                    <li key={r.id} className="py-3">
                      <div className="flex items-center gap-3">
                        <Avatar name={name} src={t?.profile?.avatar_url} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted truncate">
                            {t?.nationality || '—'} · {t?.destination || 'Da Nang'}
                          </p>
                        </div>
                        <span className={`badge badge-${stage.tone}`}>Searching</span>
                        <Link
                          href="/buddy/requests"
                          className="inline-flex items-center h-8 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                        >
                          Review
                        </Link>
                      </div>
                      {r.message ? (
                        <p className="text-xs text-muted italic mt-2 pl-12 line-clamp-2">
                          &ldquo;{r.message}&rdquo;
                        </p>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* ============================================================
            UPCOMING TRIPS
            ============================================================ */}
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

      {/* ============================================================
          EARNINGS + SPECIALTIES (side by side)
          ============================================================ */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section aria-labelledby="earnings-title" className="border border-border rounded-sm p-6 bg-surface">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 id="earnings-title" className="text-section-title mb-1">
                Earnings this month
              </h2>
              <p className="text-sm text-muted">
                Based on {completedThisMonth} completed {completedThisMonth === 1 ? 'trip' : 'trips'} at ${hourlyRate}/hour.
              </p>
            </div>
            <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-primary text-paper" aria-hidden="true">
              <DollarSign size={18} />
            </span>
          </div>
          <p className="text-4xl font-semibold text-ink mt-4">
            ${earningsThisMonth.toFixed(0)}
            <span className="text-sm font-normal text-muted ml-1">USD estimated</span>
          </p>
        </section>

        <section aria-labelledby="specialties-title" className="border border-border rounded-sm p-6 bg-surface">
          <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
            <div>
              <h2 id="specialties-title" className="text-section-title mb-1">
                Your specialties
              </h2>
              <p className="text-sm text-muted">
                Tourists filter by these.
              </p>
            </div>
            <Link
              href="/buddy/profile"
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <Pencil size={12} aria-hidden="true" />
              Edit
            </Link>
          </div>
          {specialties.length > 0 ? (
            <ul className="flex flex-wrap gap-2">
              {specialties.map((s) => (
                <li
                  key={s}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-sm bg-paper text-ink border border-border"
                >
                  {labelFor(s)}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState
              icon={Search}
              title="No specialties yet"
              description="Add specialties so tourists can find you by interest."
            />
          )}
        </section>
      </div>

      {/* ============================================================
          QUICK ACTIONS
          ============================================================ */}
      <section aria-label="Quick actions">
        <h2 className="text-lg font-semibold mb-3">Quick actions</h2>
        <ul className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <li>
            <Link
              href="/buddy/requests"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-warning text-paper flex-shrink-0" aria-hidden="true">
                <Inbox size={18} />
              </span>
              <span>
                <strong className="block text-sm font-semibold">Review requests</strong>
                <small className="block text-xs text-muted mt-0.5">{pendingRequests.length} pending</small>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/buddy/profile"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-info text-paper flex-shrink-0" aria-hidden="true">
                <ClipboardList size={18} />
              </span>
              <span>
                <strong className="block text-sm font-semibold">Complete profile</strong>
                <small className="block text-xs text-muted mt-0.5">Bio, specialties, rate</small>
              </span>
            </Link>
          </li>
          <li>
            <Link
              href="/chat"
              className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
            >
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-primary text-paper flex-shrink-0" aria-hidden="true">
                <MessageCircle size={18} />
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
              <span className="inline-flex items-center justify-center w-10 h-10 rounded-sm bg-success text-paper flex-shrink-0" aria-hidden="true">
                <MapPin size={18} />
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
