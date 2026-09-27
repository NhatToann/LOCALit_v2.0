'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { createClient } from '@/utils/supabase/auth';
import { Briefcase, Users, Clock, Send, MapPin, Calendar, User, Search, Map as MapIcon, MessageCircle, UserCircle, Compass, Phone } from 'lucide-react';
import { Avatar } from '@/components/ui/Avatar';
import { EmptyState } from '@/components/ui/Avatar';
import type { Profile, Trip, Connection } from '@/lib/types';
import { useLiveUserLocations } from '@/hooks/useLiveUserLocations';
import { getConnectionStage, daysUntilExpiry, expiryLabel } from '@/lib/connection-stages';

const MapView = dynamic(() => import('@/components/map/MapView'), { ssr: false });

const DEFAULT_LOCATION = { lat: 16.0544, lng: 108.2023 };

export default function TouristDashboardPage() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [buddies, setBuddies] = useState<any[]>([]);
  const [reviewsCount, setReviewsCount] = useState(0);
  const [userLocation, setUserLocation] = useState(DEFAULT_LOCATION);
  const [hasGpsFix, setHasGpsFix] = useState(false);
  const [loading, setLoading] = useState(true);

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

  async function load() {
    try {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const [{ data: p }, { data: t }, { data: c }, { data: buddyPins }, { count: rCount }] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>(),
        supabase
          .from('trips')
          .select('*, buddy:buddies(id, location_city, latitude, longitude, profile:profiles(full_name, is_online))')
          .eq('tourist_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('connections')
          .select('*, buddy:buddies(*, profile:profiles(full_name, is_online))')
          .eq('tourist_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('buddies')
          .select('id, location_city, latitude, longitude, is_available, is_online, profile:profiles(full_name)')
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
      ])

      setProfile(p ?? null)
      setTrips((t || []) as Trip[])
      setConnections((c || []) as Connection[])
      setBuddies(buddyPins ?? [])
      setReviewsCount(rCount ?? 0)
    } catch (err) {
      // Silent failure — UI already shows skeleton during load
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

  const accepted = connections.filter((c) => c.status === 'accepted')
  const pending = connections.filter((c) => c.status === 'pending')

  const stats = [
    { label: 'Trips', value: trips.length, icon: Briefcase, tone: 'primary' as const },
    { label: 'Buddies connected', value: accepted.length, icon: Users, tone: 'success' as const },
    { label: 'Pending requests', value: pending.length, icon: Clock, tone: 'warning' as const },
    { label: 'Reviews sent', value: reviewsCount, icon: Send, tone: 'info' as const },
  ]

  const firstName = profile?.full_name?.split(' ')[0] || 'traveler'
  const nearbyCount = buddies.length + liveLocations.length
  const onlineBuddies = buddies.filter((b) => b.is_online).slice(0, 5)

  return (
    <div className="container-page py-8 lg:py-12">
      {/* Hero — AEO answer capsule + role-specific CTA */}
      <section
        aria-labelledby="tourist-hero-title"
        className="mb-8 pb-8 border-b border-border"
      >
        <p className="text-eyebrow text-primary mb-3">Tourist dashboard</p>
        <h1 id="tourist-hero-title" className="text-page-title mb-3">
          Welcome back, {firstName}
        </h1>
        <p className="text-base text-muted mb-6 max-w-2xl">
          You have {pending.length} pending {pending.length === 1 ? 'request' : 'requests'} and {trips.length}{' '}
          {trips.length === 1 ? 'trip' : 'trips'} on your Da Nang itinerary.
        </p>
        <div className="flex flex-wrap gap-3">
          <Link
            href="/tourist/browse"
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <Search size={16} aria-hidden="true" />
            Find buddies
          </Link>
          <Link
            href="/tourist/trips/create"
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <Briefcase size={16} aria-hidden="true" />
            Plan a trip
          </Link>
        </div>
      </section>

      {/* Featured map */}
      <section
        aria-labelledby="tourist-map-title"
        className="mb-8 border border-border rounded-sm overflow-hidden bg-surface"
      >
        <div className="px-6 py-4 border-b border-border flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="tourist-map-title" className="text-section-title mb-1">
              Who is in Da Nang right now
            </h2>
            <p className="text-sm text-muted">
              {nearbyCount > 0
                ? `${buddies.length} available buddies + ${liveLocations.length} live traveller${liveLocations.length === 1 ? '' : 's'}.`
                : 'Buddies and travellers will appear here as they go online.'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <ShareStatusBadge granted={selfGranted} denied={selfDenied} hasFix={hasGpsFix} />
            <Link
              href="/map"
              className="inline-flex items-center h-8 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              Open full map
            </Link>
          </div>
        </div>
        <div className="h-[420px] lg:h-[520px]">
          <MapView
            userLocation={userLocation}
            height="100%"
            selfLiveOverride={selfGranted}
            liveLocations={liveLocations}
          />
        </div>
      </section>

      {/* Buddies available NOW (role-specific, per role-differentiation plan) */}
      {onlineBuddies.length > 0 ? (
        <section
          aria-labelledby="buddies-available-now-title"
          className="mb-8 pb-8 border-b border-border"
        >
          <div className="flex items-baseline justify-between mb-4">
            <h2 id="buddies-available-now-title" className="text-section-title">
              Buddies available now in Da Nang
            </h2>
            <Link href="/tourist/browse" className="text-sm text-primary hover:underline">
              See all
            </Link>
          </div>
          <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {onlineBuddies.map((b) => (
              <li key={b.id}>
                <Link
                  href={`/tourist/buddy/${b.id}`}
                  className="flex items-center gap-3 p-3 border border-border rounded-sm hover:border-border-strong transition-colors duration-150"
                >
                  <Avatar
                    name={b.profile?.full_name ?? 'Buddy'}
                    online={b.is_online}
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
      <section aria-label="Tourist stats" className="mb-8">
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
              </li>
            )
          })}
        </ul>
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Trips */}
        <section className="lg:col-span-2 border border-border rounded-sm bg-surface" aria-labelledby="trips-title">
          <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
            <div>
              <h2 id="trips-title" className="text-lg font-semibold">
                Your trips
              </h2>
              <p className="text-sm text-muted">Itineraries you are planning with local buddies.</p>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/tourist/trips/create"
                className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
              >
                <Briefcase size={14} aria-hidden="true" />
                Plan a trip
              </Link>
              <Link href="/tourist/trips" className="text-sm text-primary hover:underline">
                See all
              </Link>
            </div>
          </header>
          <div className="p-6">
            {trips.length === 0 ? (
              <EmptyState
                icon={Briefcase}
                title="You do not have any trips yet"
                description="Plan a Da Nang itinerary to share with a buddy."
                action={
                  <Link
                    href="/tourist/trips/create"
                    className="inline-flex items-center justify-center h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                  >
                    Plan your first trip
                  </Link>
                }
              />
            ) : (
              <ul className="divide-y divide-border">
                {trips.slice(0, 5).map((trip) => {
                  const buddy = trip.buddy as any
                  const statusTone =
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
                        <p className="text-sm font-medium text-ink truncate">{trip.title}</p>
                        <p className="text-xs text-muted mt-0.5">
                          <MapPin size={12} className="inline mr-1" aria-hidden="true" />
                          {trip.destination}
                          {trip.start_date ? (
                            <>
                              {' · '}
                              <Calendar size={12} className="inline mr-1" aria-hidden="true" />
                              {new Date(trip.start_date).toLocaleDateString('en-US')}
                            </>
                          ) : null}
                        </p>
                        {buddy?.profile?.full_name ? (
                          <p className="text-xs text-muted mt-0.5">
                            <User size={12} className="inline mr-1" aria-hidden="true" />
                            {buddy.profile.full_name}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`badge badge-${statusTone}`}>{trip.status}</span>
                        {trip.status === 'completed' && buddy?.id ? (
                          <Link
                            href={`/review/${trip.id}`}
                            className="inline-flex items-center h-8 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                          >
                            Review
                          </Link>
                        ) : null}
                      </div>
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
                    href="/tourist/browse"
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
                  return (
                    <li key={c.id} className="py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar name={name} src={avatarUrl} size="md" online={c.status === 'accepted'} />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-xs text-muted truncate">
                            {buddy?.location_city ?? 'Da Nang'}
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

      {/* Quick actions */}
      <section className="mt-6" aria-label="Quick actions">
        <h2 className="text-lg font-semibold mb-3">Quick actions</h2>
        <ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <QuickAction
            href="/tourist/browse"
            icon={Search}
            title="Find buddies"
            subtitle="Browse verified local guides"
          />
          <QuickAction
            href="/map"
            icon={MapIcon}
            title="Buddy map"
            subtitle="See who is nearby right now"
          />
          <QuickAction href="/chat" icon={MessageCircle} title="Messages" subtitle="Chat with your buddies" />
          <QuickAction
            href="/tourist/profile"
            icon={User}
            title="My profile"
            subtitle="Update preferences and interests"
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
