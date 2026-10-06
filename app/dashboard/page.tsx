'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/auth';
import { Briefcase, Users, Clock, Send, MapPin, Calendar, User, Search, MessageCircle, UserCircle, Compass, Phone } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/Avatar';
import type { Profile, Itinerary, Connection } from '@/lib/types';
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations';
import { getConnectionStage, daysUntilExpiry, expiryLabel } from '@/lib/connection-stages';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 };

export default function DashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [itineraries, setItineraries] = useState<Itinerary[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [buddies, setBuddies] = useState<any[]>([]);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [loading, setLoading] = useState(true);
  const [coBuddyCountByItin, setCoBuddyCountByItin] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState<string | null>(null);

  const { liveLocations, selfGranted, selfDenied } = useLiveUserLocations({
    enabled: true,
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return;

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setHasGpsFix(true);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 30000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, []);

  useEffect(() => {
    load();
  }, []);

  // Realtime refresh: when the user gets a new connection request,
  // confirms a trip, or any buddy flips online/offline, refetch the
  // dashboard slices. Debounced to coalesce a burst into one round-trip.
  useEffect(() => {
    if (!profile?.id) return
    const supabase = createClient()
    let timer: ReturnType<typeof setTimeout> | null = null
    const refresh = () => {
      if (timer) return
      timer = setTimeout(() => {
        timer = null
        load()
      }, 1200)
    }
    const channel = supabase
      .channel(`dash-${profile.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'connections' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itineraries' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_collaborators' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_stops' }, refresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buddies' }, refresh)
      .subscribe()
    return () => {
      if (timer) clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [profile?.id])

  async function load() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: p }, { data: t }, { data: c }, { data: buddyPins }, { count: rCount }, { data: collaboratorCount }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
        supabase
          .from('itineraries')
          .select('*, owner:safe_profiles!itineraries_owner_id_fkey(full_name, avatar_url, is_online), stops:itinerary_stops(id, day_id, name, lat, lng)')
          .eq('owner_id', user.id)
          .order('start_date', { ascending: true, nullsFirst: false }),
        supabase
          .from('connections')
          .select('*, buddy:buddies(*, profile:safe_profiles(full_name, avatar_url, is_online))')
          .eq('tourist_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('buddies')
          .select('id, location_city, latitude, longitude, is_available, is_online, profile:safe_profiles(full_name, is_online)')
          .eq('location_city', 'Da Nang')
          .eq('is_available', true)
          .not('latitude', 'is', null)
          .not('longitude', 'is', null)
          .order('is_online', { ascending: false })
          .limit(20),
        supabase
          .from('reviews')
          .select('id', { count: 'exact', head: true })
          .eq('reviewer_id', user.id),
        supabase
          .from('itinerary_collaborators')
          .select('itinerary_id, role')
          .eq('status', 'accepted')
          .in('role', ['editor', 'viewer'])
          .neq('user_id', user.id),
      ])

      setProfile(p ?? null)
      setItineraries((t || []) as Itinerary[])
      setConnections((c || []) as Connection[])
      setBuddies(buddyPins ?? [])
      setReviewsCount(rCount ?? 0)
      const coMap: Record<string, number> = {}
      for (const row of collaboratorCount || []) {
        coMap[row.itinerary_id] = (coMap[row.itinerary_id] || 0) + 1
      }
      setCoBuddyCountByItin(coMap)
    } catch (err) {
      setLoadError((err as Error).message || 'Could not load dashboard.')
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="container-page py-16">
        <div className="alert alert-error mb-4" role="alert">
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="ml-auto inline-flex items-center h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            Retry
          </button>
        </div>
      </div>
    )
  }

  const accepted = connections.filter((c) => c.status === 'accepted')
  const pending = connections.filter((c) => c.status === 'pending')

  const stats = [
    { label: 'Itineraries', labelVi: 'Lịch trình', value: itineraries.length, icon: Briefcase, tone: 'primary' as const },
    { label: 'Buddies connected', labelVi: 'Đã kết nối', value: accepted.length, icon: Users, tone: 'success' as const },
    { label: 'Pending requests', labelVi: 'Đang chờ', value: pending.length, icon: Clock, tone: 'warning' as const },
    { label: 'Reviews sent', labelVi: 'Đánh giá', value: reviewsCount, icon: Send, tone: 'info' as const },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'traveler'
  const nearbyCount = buddies.length + liveLocations.length
  const onlineBuddies = buddies.filter((b: any) => b.profile?.is_online ?? b.is_online).slice(0, 5)

  return (
    <div className="container-page py-8 lg:py-12">
      <section
        aria-labelledby="dashboard-hero-title"
        className="mb-8 pb-8 border-b border-border"
      >
        <p className="text-eyebrow text-primary mb-3">
          Dashboard
          <span
            className="ml-2 italic text-muted"
            style={{ letterSpacing: '0.02em' }}
            aria-hidden="true"
          >
            tổng quan
          </span>
        </p>
        <h1 id="dashboard-hero-title" className="text-page-title mb-3">
          Welcome back, {firstName}
        </h1>
        <p className="text-base text-muted mb-6 max-w-2xl">
          You have {pending.length} pending {pending.length === 1 ? 'request' : 'requests'} and {itineraries.length}{' '}
          {itineraries.length === 1 ? 'itinerary' : 'itineraries'} on your Da Nang trip.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/browse"
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Search size={16} aria-hidden="true" />
            Find buddies
          </Link>
          <Link
            href="/itinerary/new"
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <Briefcase size={16} aria-hidden="true" />
            Plan a trip
          </Link>
        </div>
      </section>

      {/* Featured map */}
      <section
        aria-labelledby="dashboard-map-title"
        className="mb-8 border border-border rounded-sm overflow-hidden bg-surface"
      >
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="dashboard-map-title" className="text-section-title mb-1">
              Who is in Da Nang right now
              <span
                className="ml-2 italic text-muted font-normal text-base"
                style={{ letterSpacing: '0.02em' }}
                aria-hidden="true"
              >
                ai đang ở Đà Nẵng
              </span>
            </h2>
            <p className="text-sm text-muted">
              {nearbyCount > 0
                ? `${buddies.length} available buddies + ${liveLocations.length} live traveller${liveLocations.length === 1 ? '' : 's'}.`
                : 'Buddies and travellers will appear here as they go online.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ShareStatusBadge granted={selfGranted} denied={selfDenied} hasFix={hasGpsFix} />
          </div>
        </div>
        <div className="h-[420px] lg:h-[520px]">
          <MapView
            userLocation={userLocation}
            height="100%"
            hasGpsFix={hasGpsFix || selfGranted}
            selfLiveOverride={selfGranted}
            liveLocations={liveLocations}
          />
        </div>
      </section>

      {/* Buddies available NOW */}
      {onlineBuddies.length > 0 ? (
        <section
          aria-labelledby="buddies-available-now-title"
          className="mb-8 pb-8 border-b border-border"
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 id="buddies-available-now-title" className="text-section-title">
              Buddies available now in Da Nang
              <span
                className="ml-2 italic text-muted font-normal text-base"
                style={{ letterSpacing: '0.02em' }}
                aria-hidden="true"
              >
                đang rảnh
              </span>
            </h2>
            <Link href="/search?sort=match" className="text-sm text-primary hover:underline">
              See all
            </Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {onlineBuddies.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/buddies/${b.id}`}
                  className="flex items-center gap-3 p-3 border border-border rounded-sm hover:border-border-strong transition-colors duration-150"
                >
                  <Avatar
                    name={b.profile?.full_name ?? 'Buddy'}
                    online={(b.profile?.is_online ?? b.is_online) === true}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-ink truncate">{b.profile?.full_name ?? 'Buddy'}</p>
                    <p className="text-xs text-muted truncate">
                      <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                      {b.location_city ?? 'Da Nang'}
                    </p>
                  </div>
                  <span className="badge badge-success">
                    <span
                      className="inline-block w-1.5 h-1.5 rounded-full bg-success mr-1"
                      aria-hidden="true"
                    />
                    Online
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Stats */}
      <section aria-label="Your stats" className="mb-8">
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
                <p
                  className="text-2xl font-semibold text-ink"
                  style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontVariantNumeric: 'tabular-nums',
                    letterSpacing: '-0.01em',
                  }}
                >
                  {s.value}
                </p>
                <p className="text-xs text-muted mt-0.5">{s.label}</p>
                <p
                  className="text-[10px] italic text-subtle"
                  style={{ letterSpacing: '0.02em' }}
                  aria-hidden="true"
                >
                  {s.labelVi}
                </p>
              </li>
            )
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Itineraries */}
        <section className="lg:col-span-2 border border-border rounded-sm bg-surface" aria-labelledby="itineraries-title">
          <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 id="itineraries-title" className="text-lg font-semibold">
                Your itineraries
              </h2>
              <p className="text-sm text-muted">Itineraries you are planning with local buddies.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/itinerary/new"
                className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                <Briefcase size={14} aria-hidden="true" />
                Plan an itinerary
              </Link>
              <Link href="/itinerary" className="text-sm text-primary hover:underline">
                See all
              </Link>
            </div>
          </header>
          <div className="p-6">
            {itineraries.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="You do not have any itineraries yet"
                description="Plan a Da Nang itinerary to share with a buddy."
                action={
                  <Link
                    href="/itinerary/new"
                    className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                  >
                    Plan your first itinerary
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {itineraries.slice(0, 5).map((itin) => {
                  const stopCount = Array.isArray((itin as any).stops) ? (itin as any).stops.length : 0
                  const collaboratorCount = coBuddyCountByItin[itin.id] ?? 0
                  const statusTone =
                    itin.status === 'completed'
                      ? 'info'
                      : itin.status === 'confirmed'
                        ? 'success'
                        : itin.status === 'cancelled'
                          ? 'danger'
                          : 'warning'
                  return (
                    <li key={itin.id}>
                      <Link
                        href={`/itinerary/${itin.id}`}
                        className="flex items-center justify-between gap-3 py-3 px-2 -mx-2 rounded-sm hover:bg-paper transition-colors duration-150"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink truncate">{itin.title}</p>
                          <p className="text-xs text-muted mt-0.5">
                            <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                            {itin.destination}
                            {itin.start_date ? (
                              <>
                                {' · '}
                                <Calendar size={12} className="inline mr-1" aria-hidden="true" />
                                {new Date(itin.start_date).toLocaleDateString('en-US')}
                                {itin.end_date ? ` – ${new Date(itin.end_date).toLocaleDateString('en-US')}` : ''}
                              </>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted mt-0.5">
                            <Compass size={12} className="inline mr-1" aria-hidden="true" />
                            {stopCount} stop{stopCount === 1 ? '' : 's'}
                            {collaboratorCount > 0 ? ` · ${collaboratorCount} collaborator${collaboratorCount === 1 ? '' : 's'}` : ''}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`badge badge-${statusTone}`}>{itin.status}</span>
                          <Compass
                            size={14}
                            className="text-subtle flex-shrink-0"
                            aria-hidden="true"
                          />
                        </div>
                      </Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>

        {/* My buddies */}
        <section className="border border-border rounded-sm bg-surface" aria-labelledby="buddies-title">
          <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 id="buddies-title" className="text-lg font-semibold">
                My buddies
              </h2>
              <p className="text-sm text-muted">Buddies you have connected with.</p>
            </div>
            <Link href="/chat" className="text-sm text-primary hover:underline">
              Open chat
            </Link>
          </header>
          <div className="p-6">
            {connections.length === 0 ? (
              <EmptyState
                icon={UserCircle}
                title="No connections yet"
                description="Browse buddies to send your first connection request."
                action={
                  <Link
                    href="/browse"
                    className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                  >
                    Browse buddies
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {connections.slice(0, 5).map((c) => {
                  const buddy = c.buddy as any
                  const name = buddy?.profile?.full_name ?? 'Buddy'
                  const avatarUrl = buddy?.profile?.avatar_url
                  const stage = getConnectionStage(c.status)
                  const daysLeft = c.status === 'accepted' ? daysUntilExpiry(c.updated_at) : null
                  const itinId = itineraries.find((tt) => tt.owner_id === c.tourist_id)?.id
                  const extraBuddies = itinId ? coBuddyCountByItin[itinId] || 0 : 0
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={name} src={avatarUrl} size="md" online={c.status === 'accepted'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted truncate">
                            {buddy?.location_city ?? 'Da Nang'}
                            {extraBuddies > 0 ? ` · +${extraBuddies} co-buddy${extraBuddies === 1 ? '' : 'ies'}` : ''}
                            {daysLeft !== null ? ` · ${expiryLabel(daysLeft)}` : ''}
                          </p>
                        </div>
                        <span className={`badge badge-${stage.tone}`}>{stage.stage}</span>
                        <Link
                          href={`/chat?buddy=${buddy?.id}`}
                          aria-label={`Message ${name}`}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-sm hover:bg-paper text-muted hover:text-ink"
                        >
                          <MessageCircle size={16} aria-hidden="true" />
                        </Link>
                      </div>
                      {c.status === 'accepted' ? (
                        <div className="mt-2 flex flex-wrap items-center gap-2 pl-12">
                          <Link
                            href={`/chat?buddy=${buddy?.id}&call=1`}
                            className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                          >
                            <Phone size={11} aria-hidden="true" />
                            Call
                          </Link>
                          <Link
                            href={`/itinerary/${c.id}`}
                            className="inline-flex items-center gap-1 h-7 px-2.5 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                          >
                            <Compass size={11} aria-hidden="true" />
                            Itinerary
                          </Link>
                        </div>
                      ) : null}
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </section>
      </div>

      <section className="mt-6" aria-label="Quick actions">
        <h2 className="text-lg font-semibold mb-3">Quick actions</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <QuickAction
            href="/browse"
            icon={Search}
            title="Find buddies"
            subtitle="Browse verified local guides"
          />
          <QuickAction
            href="/itinerary/new"
            icon={Briefcase}
            title="Plan a new trip"
            subtitle="Sketch a Da Nang itinerary"
          />
          <QuickAction
            href="/profile"
            icon={User}
            title="Edit profile"
            subtitle="Interests, languages, arrival"
          />
        </ul>
      </section>
    </div>
  )
}

function QuickAction({
  href,
  icon: IconCmp,
  title,
  subtitle,
}: {
  href: string
  icon: typeof Search
  title: string
  subtitle: string
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-start gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
      >
        <span className="text-muted mt-0.5">
          <IconCmp size={20} aria-hidden="true" />
        </span>
        <span>
          <strong className="block text-sm font-semibold text-ink">{title}</strong>
          <small className="block text-xs text-muted mt-0.5">{subtitle}</small>
        </span>
      </Link>
    </li>
  )
}

function ShareStatusBadge({
  granted,
  denied,
  hasFix,
}: {
  granted: boolean
  denied: boolean
  hasFix: boolean
}) {
  if (granted && hasFix) {
    return (
      <span
        className="badge badge-success"
        title="You are sharing your live location with other travellers on the map."
      >
        <span
          className="inline-block w-2 h-2 rounded-full bg-success mr-1.5 animate-pulse"
          aria-hidden="true"
        />
        Sharing live
      </span>
    )
  }
  if (denied) {
    return (
      <span
        className="badge badge-warning"
        title="Location permission was denied. Enable it in your browser to show up on the map."
      >
        Location off
      </span>
    )
  }
  return (
    <span className="badge badge-warning" title="Asking for location permission">
      Locating
    </span>
  )
}