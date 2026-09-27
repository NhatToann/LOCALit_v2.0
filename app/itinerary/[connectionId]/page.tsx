'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Compass,
  Calendar,
  Backpack,
  Receipt,
  AlertTriangle,
  Users,
  Clock,
  Phone,
  MessageCircle,
  ArrowLeft,
  Pencil,
  Check,
  Share2,
  Copy,
  Pin,
  Plus,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Connection, Trip, Profile, TripActivity } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { daysUntilExpiry, expiryLabel } from '@/lib/connection-stages'
import PlanTab from '@/components/itinerary/PlanTab'
import DaysTab from '@/components/itinerary/DaysTab'
import BookingsTab from '@/components/itinerary/BookingsTab'
import PackingTab from '@/components/itinerary/PackingTab'
import ActivityFeed from '@/components/itinerary/ActivityFeed'

interface PageProps {
  params: Promise<{ connectionId: string }>
}

type Tab = 'plan' | 'days' | 'bookings' | 'packing'

const TABS: Array<{ id: Tab; label: string; icon: typeof Compass }> = [
  { id: 'plan', label: 'Plan', icon: Pencil },
  { id: 'days', label: 'Days & Map', icon: Calendar },
  { id: 'bookings', label: 'Bookings & Budget', icon: Receipt },
  { id: 'packing', label: 'Packing', icon: Backpack },
]

export default function SharedItineraryPage({ params }: PageProps) {
  const router = useRouter()
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [me, setMe] = useState<Profile | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [tab, setTab] = useState<Tab>('plan')
  const [activity, setActivity] = useState<TripActivity[]>([])
  const [travelers, setTravelers] = useState<Array<{ id: string; full_name: string; avatar_url: string | null; nationality: string | null; role: string }>>([])
  const [coBuddies, setCoBuddies] = useState<Array<{ id: string; full_name: string; avatar_url: string | null; specialties: string[]; role: string }>>([])
  const [showActivity, setShowActivity] = useState(true)
  const [showShareMenu, setShowShareMenu] = useState(false)
  const [copyOk, setCopyOk] = useState(false)

  useEffect(() => {
    params.then((p) => setConnectionId(p.connectionId))
  }, [params])

  const load = useCallback(async (cid: string) => {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=/itinerary/${cid}`)
      return
    }
    setMe(user as unknown as Profile)

    const { data: conn } = await supabase
      .from('connections')
      .select(
        '*, tourist:tourists(*, profile:profiles(*)), buddy:buddies(*, profile:profiles(*))',
      )
      .eq('id', cid)
      .maybeSingle()

    // Connection not found OR not a party — find the user's most relevant
    // connection instead. Prefer accepted (so editing is unlocked), then any.
    let resolved = conn as Connection | null
    if (!resolved || (resolved.tourist_id !== user.id && resolved.buddy_id !== user.id)) {
      const { data: userConns } = await supabase
        .from('connections')
        .select('id, status, updated_at')
        .or(`tourist_id.eq.${user.id},buddy_id.eq.${user.id}`)
        .order('updated_at', { ascending: false })
        .limit(20)

      const accepted = (userConns || []).find((c) => c.status === 'accepted')
      const fallback = accepted || (userConns || [])[0]
      if (fallback) {
        router.replace(`/itinerary/${fallback.id}`)
        return
      }
      setLoading(false)
      return
    }
    setConnection(resolved)

    const isTourist = resolved.tourist_id === user.id
    const isBuddy = resolved.buddy_id === user.id
    if (!isTourist && !isBuddy) {
      setLoading(false)
      return
    }
    setCanEdit(resolved.status === 'accepted')

    const { data: trips } = await supabase
      .from('trips')
      .select(
        '*, tourist:tourists(*, profile:profiles(*)), buddy:buddies(*, profile:profiles(*))',
      )
      .eq('tourist_id', resolved.tourist_id)
      .eq('buddy_id', resolved.buddy_id)
      .order('updated_at', { ascending: false })
      .limit(1)

    let activeTrip = (trips && trips.length > 0 ? trips[0] : null) as Trip | null
    if (!activeTrip) {
      const buddyProfile = (resolved.buddy as any)?.profile
      const title = `Da Nang trip with ${buddyProfile?.full_name ?? 'buddy'}`
      const { data: created } = await supabase
        .from('trips')
        .insert({
          tourist_id: resolved.tourist_id,
          buddy_id: resolved.buddy_id,
          title,
          destination: 'Da Nang',
          status: 'planning',
        })
        .select()
        .single()
      activeTrip = created as Trip
    }
    setTrip(activeTrip)

    if (activeTrip) {
      const [
        { data: acts },
        { data: travelersRows },
        { data: buddiesRows },
      ] = await Promise.all([
        supabase
          .from('trip_activity')
          .select('*, actor:profiles!trip_activity_actor_id_fkey(id, full_name, avatar_url)')
          .eq('trip_id', activeTrip.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('trip_travelers')
          .select('role, status, profile:profiles(id, full_name, avatar_url), tourist:tourists(nationality)')
          .eq('trip_id', activeTrip.id)
          .order('role', { ascending: true }),
        supabase
          .from('trip_buddies')
          .select('role, status, profile:profiles(id, full_name, avatar_url), buddy:buddies(specialties)')
          .eq('trip_id', activeTrip.id)
          .order('role', { ascending: true }),
      ])
      setActivity((acts as any) || [])
      setTravelers(
        ((travelersRows as any[]) || []).map((r) => ({
          id: r.profile?.id ?? r.tourist_id,
          full_name: r.profile?.full_name ?? 'Traveler',
          avatar_url: r.profile?.avatar_url ?? null,
          nationality: r.tourist?.nationality ?? null,
          role: r.role,
        })),
      )
      setCoBuddies(
        ((buddiesRows as any[]) || []).map((r) => ({
          id: r.profile?.id ?? r.buddy_id,
          full_name: r.profile?.full_name ?? 'Buddy',
          avatar_url: r.profile?.avatar_url ?? null,
          specialties: r.buddy?.specialties ?? [],
          role: r.role,
        })),
      )
    }

    setLoading(false)
  }, [router])

  useEffect(() => {
    if (connectionId) load(connectionId)
  }, [connectionId, load])

  // Realtime: subscribe to trip_activity for live feed
  useEffect(() => {
    if (!trip) return
    const supabase = createClient()
    const channel = supabase
      .channel(`trip-activity-${trip.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'trip_activity',
          filter: `trip_id=eq.${trip.id}`,
        },
        async (payload) => {
          // Refetch activity to get joined actor
          const { data } = await supabase
            .from('trip_activity')
            .select('*, actor:profiles!trip_activity_actor_id_fkey(id, full_name, avatar_url)')
            .eq('trip_id', trip.id)
            .order('created_at', { ascending: false })
            .limit(20)
          setActivity((data as any) || [])
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [trip?.id])

  function logActivity(verb: string, payload: Record<string, unknown> = {}) {
    if (!trip || !me) return
    const supabase = createClient()
    supabase
      .from('trip_activity')
      .insert({
        trip_id: trip.id,
        actor_id: me.id,
        verb,
        payload,
      })
      .then(() => {
        // Realtime will refresh; nothing else to do
      })
  }

  async function copyShareLink() {
    if (!trip?.share_token) return
    const url = `${window.location.origin}/itinerary/share/${trip.share_token}`
    try {
      await navigator.clipboard.writeText(url)
      setCopyOk(true)
      setTimeout(() => setCopyOk(false), 2000)
    } catch {
      window.prompt('Copy this link:', url)
    }
  }

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  if (!connection) {
    return (
      <div className="container-page py-16">
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>No active connection found. Accept or send a buddy request to start an itinerary.</span>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href={me?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to dashboard
          </Link>
          {me?.role !== 'buddy' ? (
            <Link
              href="/tourist/browse"
              className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              Find a buddy
            </Link>
          ) : null}
        </div>
      </div>
    )
  }

  const buddy = connection.buddy as any
  const tourist = connection.tourist as any
  const buddyName = buddy?.profile?.full_name ?? 'Buddy'
  const touristName = tourist?.profile?.full_name ?? 'Traveler'
  const buddyAvatar = buddy?.profile?.avatar_url
  const touristAvatar = tourist?.profile?.avatar_url
  const daysLeft = connection.status === 'accepted' ? daysUntilExpiry(connection.updated_at) : null

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      {/* Top breadcrumb */}
      <div className="flex items-center justify-between gap-2">
        <Link
          href={me?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/dashboard'}
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink"
        >
          <ArrowLeft size={14} aria-hidden="true" />
          Back
        </Link>
        {trip?.share_token ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowShareMenu((s) => !s)}
              className="inline-flex items-center gap-1 h-8 px-3 text-sm rounded-sm bg-surface text-ink border border-border-strong hover:bg-paper"
              aria-label="Share itinerary"
            >
              <Share2 size={13} aria-hidden="true" />
              Share
            </button>
            {showShareMenu ? (
              <div className="absolute right-0 top-full mt-1 z-20 w-72 p-3 bg-surface border border-border rounded-sm shadow-focus">
                <p className="text-xs text-muted mb-2">
                  Anyone with this link can read (not edit) your itinerary.
                </p>
                <button
                  type="button"
                  onClick={copyShareLink}
                  className="w-full inline-flex items-center justify-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-primary text-paper hover:bg-primary-hover"
                >
                  {copyOk ? (
                    <>
                      <Check size={12} aria-hidden="true" /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={12} aria-hidden="true" /> Copy public link
                    </>
                  )}
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Hero */}
      <section className="relative overflow-hidden border border-border rounded-sm bg-surface">
        <div
          className="absolute inset-0 bg-cover bg-center"
          style={{
            backgroundImage:
              "url('https://images.unsplash.com/photo-1602002418082-a4443e081dd1?w=1600&q=70&auto=format&fit=crop')",
            opacity: 0.18,
          }}
          aria-hidden="true"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(90deg, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.7) 100%)' }}
          aria-hidden="true"
        />
        <div className="relative p-6 lg:p-8">
          <p className="text-eyebrow text-primary mb-2">Shared itinerary</p>
          <h1 className="text-page-title mb-2">{trip?.title ?? 'Da Nang itinerary'}</h1>
          <p className="text-sm text-muted mb-4 max-w-xl">
            {travelers.length > 1 || coBuddies.length > 1
              ? `This trip has ${travelers.length} traveler${travelers.length === 1 ? '' : 's'} and ${coBuddies.length} guide${coBuddies.length === 1 ? '' : 's'}. All accepted participants can read; leads can edit.`
              : `Both ${touristName} and ${buddyName} can edit this page. Changes save automatically.`}
          </p>
          <div className="flex flex-wrap items-center gap-3 mb-3">
            <span className="badge badge-primary text-xs">
              Travelers ({travelers.length})
            </span>
            <ul className="flex flex-wrap items-center gap-2">
              {travelers.length === 0 ? (
                <li className="text-xs text-muted">No travelers yet.</li>
              ) : (
                travelers.map((t) => (
                  <li
                    key={t.id}
                    className="flex items-center gap-2 border border-border rounded-sm pl-1 pr-3 py-1 bg-paper"
                  >
                    <Avatar name={t.full_name} src={t.avatar_url} size="xs" />
                    <span className="text-xs font-medium text-ink truncate max-w-[120px]">
                      {t.full_name}
                    </span>
                    {t.role === 'lead' ? (
                      <span className="badge badge-warning text-[10px]">Lead</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="badge badge-success text-xs">
              Buddies ({coBuddies.length})
            </span>
            <ul className="flex flex-wrap items-center gap-2">
              {coBuddies.length === 0 ? (
                <li className="text-xs text-muted">No buddies yet.</li>
              ) : (
                coBuddies.map((b) => (
                  <li
                    key={b.id}
                    className="flex items-center gap-2 border border-border rounded-sm pl-1 pr-3 py-1 bg-paper"
                  >
                    <Avatar name={b.full_name} src={b.avatar_url} size="xs" />
                    <span className="text-xs font-medium text-ink truncate max-w-[120px]">
                      {b.full_name}
                    </span>
                    {b.role === 'lead' ? (
                      <span className="badge badge-warning text-[10px]">Lead</span>
                    ) : null}
                  </li>
                ))
              )}
            </ul>
          </div>
          <div className="flex flex-wrap items-center gap-3 mt-4">
            <span className="hidden sm:inline text-subtle">·</span>
            <span
              className={`badge badge-${
                connection.status === 'accepted'
                  ? 'success'
                  : connection.status === 'declined'
                    ? 'danger'
                    : 'warning'
              }`}
            >
              {connection.status}
            </span>
            {daysLeft !== null ? (
              <span className="text-xs text-muted inline-flex items-center gap-1">
                <Clock size={12} aria-hidden="true" />
                {expiryLabel(daysLeft)}
              </span>
            ) : null}
          </div>
          {!canEdit ? (
            <div className="alert alert-warning mt-4" role="alert">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                Editing unlocks once the buddy accepts the connection. You can
                still read the plan.
              </span>
            </div>
          ) : null}
        </div>
      </section>

      {/* Quick actions */}
      <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Link
          href={`/chat?buddy=${connection.buddy_id}`}
          className="flex items-center gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-primary text-paper" aria-hidden="true">
            <MessageCircle size={16} />
          </span>
          <span>
            <strong className="block text-sm font-semibold">Message</strong>
            <small className="block text-xs text-muted">Chat about the plan</small>
          </span>
        </Link>
        <Link
          href={`/chat?buddy=${connection.buddy_id}&call=1`}
          className="flex items-center gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-success text-paper" aria-hidden="true">
            <Phone size={16} />
          </span>
          <span>
            <strong className="block text-sm font-semibold">Voice / video call</strong>
            <small className="block text-xs text-muted">WebRTC real-time</small>
          </span>
        </Link>
        <Link
          href={me?.role === 'buddy' ? '/buddy/dashboard' : '/tourist/trips'}
          className="flex items-center gap-3 p-4 border border-border rounded-sm bg-surface hover:border-border-strong transition-colors duration-150"
        >
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-sm bg-info text-paper" aria-hidden="true">
            <Compass size={16} />
          </span>
          <span>
            <strong className="block text-sm font-semibold">All trips</strong>
            <small className="block text-xs text-muted">Manage dates and stops</small>
          </span>
        </Link>
      </section>

      {/* Tabs */}
      <section
        className="border border-border rounded-sm bg-surface overflow-hidden"
        aria-label="Itinerary tabs"
      >
        <div role="tablist" className="flex border-b border-border overflow-x-auto">
          {TABS.map((t) => {
            const Icon = t.icon
            const isActive = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => setTab(t.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {t.label}
              </button>
            )
          })}
        </div>
        <div className="p-4 lg:p-6">
          {trip ? (
            <>
              {tab === 'plan' ? (
                <PlanTab trip={trip} canEdit={canEdit} me={me!} onLogActivity={logActivity} onTripUpdate={setTrip} />
              ) : null}
              {tab === 'days' ? (
                <DaysTab trip={trip} canEdit={canEdit} me={me!} onLogActivity={logActivity} />
              ) : null}
              {tab === 'bookings' ? (
                <BookingsTab trip={trip} canEdit={canEdit} me={me!} onLogActivity={logActivity} />
              ) : null}
              {tab === 'packing' ? (
                <PackingTab trip={trip} canEdit={canEdit} me={me!} onLogActivity={logActivity} />
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {/* Activity feed (collapsible right rail) */}
      <section
        className="border border-border rounded-sm bg-surface overflow-hidden"
        aria-label="Recent activity"
      >
        <button
          type="button"
          onClick={() => setShowActivity((s) => !s)}
          className="w-full px-4 py-3 flex items-center justify-between text-left border-b border-border hover:bg-paper"
          aria-expanded={showActivity}
        >
          <span className="inline-flex items-center gap-2 text-sm font-semibold">
            <Pin size={13} aria-hidden="true" />
            Activity
          </span>
          <span className="text-xs text-muted">
            {showActivity ? 'Hide' : `Show (${activity.length})`}
          </span>
        </button>
        {showActivity ? (
          <ActivityFeed items={activity} meId={me?.id ?? null} />
        ) : null}
      </section>
    </div>
  )
}
