'use client'

import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Compass,
  Calendar,
  Backpack,
  AlertTriangle,
  ArrowLeft,
  Pencil,
  Pin,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Connection, Trip, Profile, TripActivity, TripDay, TripStop } from '@/lib/types'
import PlanTab from '@/components/itinerary/PlanTab'
import DaysTab from '@/components/itinerary/DaysTab'
import PackingTab from '@/components/itinerary/PackingTab'
import ActivityFeed from '@/components/itinerary/ActivityFeed'
import ManageCompanions from '@/components/itinerary/ManageCompanions'
import ItineraryHeader from '@/components/itinerary/ItineraryHeader'
import ItineraryHero, { type ItineraryHeroPerson } from '@/components/itinerary/ItineraryHero'
import ItineraryMap, { type PresenceUser, type RemoteDragState } from '@/components/itinerary/ItineraryMap'
import { useTripPresence } from '@/lib/realtime/useTripPresence'
import { usePinDragBroadcast, type PinDragPayload } from '@/lib/realtime/usePinDrag'

interface PageProps {
  params: Promise<{ connectionId: string }>
}

type Tab = 'plan' | 'days' | 'packing'

const TABS: Array<{ id: Tab; label: string; labelVi: string; icon: typeof Compass }> = [
  { id: 'plan', label: 'Plan', labelVi: 'Kế hoạch', icon: Pencil },
  { id: 'days', label: 'Days & Map', labelVi: 'Ngày & Bản đồ', icon: Calendar },
  { id: 'packing', label: 'Packing', labelVi: 'Đồ dùng', icon: Backpack },
]

export default function SharedItineraryPage({ params }: PageProps) {
  const router = useRouter()
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [me, setMe] = useState<Profile | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)

  // Realtime: who's viewing this trip + pin-drag broadcast
  const presenceList = useTripPresence(
    trip?.id ?? null,
    me ? { id: me.id, fullName: me.full_name ?? 'Someone', avatarUrl: (me as any).avatar_url ?? null } : null,
  )
  const presenceUsers: PresenceUser[] = useMemo(
    () =>
      presenceList
        .filter((p) => p.userId !== me?.id)
        .map((p) => ({ id: p.userId, fullName: p.fullName, avatarUrl: p.avatarUrl })),
    [presenceList, me?.id],
  )
  const { sendDrag } = usePinDragBroadcast({
    tripId: trip?.id ?? null,
    me: me ? { id: me.id, fullName: me.full_name ?? 'Someone' } : null,
    onRemoteDrag: (p: PinDragPayload) => {
      setRemoteDrag((prev) => ({
        ...prev,
        [p.stopId]: {
          lat: p.lat,
          lng: p.lng,
          byName: p.byName,
          byAvatarUrl: null,
        },
      }))
      // Auto-clear ghost after 1.5s of silence
      setTimeout(() => {
        setRemoteDrag((prev) => {
          if (!(p.stopId in prev)) return prev
          const next = { ...prev }
          delete next[p.stopId]
          return next
        })
      }, 1500)
    },
  })
  const [tab, setTab] = useState<Tab>('plan')
  const [activity, setActivity] = useState<TripActivity[]>([])
  const [travelers, setTravelers] = useState<ItineraryHeroPerson[]>([])
  const [coBuddies, setCoBuddies] = useState<ItineraryHeroPerson[]>([])
  const [showActivity, setShowActivity] = useState(true)
  const [days, setDays] = useState<TripDay[]>([])
  const [stops, setStops] = useState<TripStop[]>([])
  const [remoteDrag, setRemoteDrag] = useState<Record<string, RemoteDragState>>({})

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
        '*, tourist:tourists(*, profile:safe_profiles(full_name, avatar_url, is_online)), buddy:buddies(*, profile:safe_profiles(full_name, avatar_url, is_online))',
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
        '*, tourist:tourists(*, profile:safe_profiles(full_name, avatar_url, is_online)), buddy:buddies(*, profile:safe_profiles(full_name, avatar_url, is_online))',
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
        { data: daysRows },
        { data: stopsRows },
      ] = await Promise.all([
        supabase
          .from('trip_activity')
          .select('*, actor:profiles!trip_activity_actor_id_fkey(id, full_name, avatar_url)')
          .eq('trip_id', activeTrip.id)
          .order('created_at', { ascending: false })
          .limit(20),
        supabase
          .from('trip_travelers')
          .select('role, status, profile:safe_profiles(id, full_name, avatar_url), tourist:tourists(nationality)')
          .eq('trip_id', activeTrip.id)
          .order('role', { ascending: true }),
        supabase
          .from('trip_buddies')
          .select('role, status, profile:safe_profiles(id, full_name, avatar_url), buddy:buddies(specialties)')
          .eq('trip_id', activeTrip.id)
          .order('role', { ascending: true }),
        supabase
          .from('trip_days')
          .select('*')
          .eq('trip_id', activeTrip.id)
          .order('day_order', { ascending: true }),
        supabase
          .from('trip_stops')
          .select('*')
          .eq('trip_id', activeTrip.id)
          .order('stop_order', { ascending: true }),
      ])
      setActivity((acts as any) || [])
      setTravelers(
        ((travelersRows as any[]) || []).map((r) => ({
          id: r.profile?.id ?? r.tourist_id,
          full_name: r.profile?.full_name ?? 'Traveler',
          avatar_url: r.profile?.avatar_url ?? null,
          role: (r.role === 'lead' ? 'lead' : 'companion'),
        })),
      )
      setCoBuddies(
        ((buddiesRows as any[]) || []).map((r) => ({
          id: r.profile?.id ?? r.buddy_id,
          full_name: r.profile?.full_name ?? 'Buddy',
          avatar_url: r.profile?.avatar_url ?? null,
          role: (r.role === 'lead' ? 'lead' : 'co-buddy'),
        })),
      )
      setDays((daysRows as TripDay[]) || [])
      setStops((stopsRows as TripStop[]) || [])

      // Self-accept invitations: when a companion or co-buddy lands on the trip
      // page, flip their own row from 'invited' to 'accepted' (RLS allows the
      // invited user to update only their own row). Silently skipped if RLS denies.
      const invitedTraveler = (travelersRows as any[])?.find(
        (r) => r.tourist_id === user.id && r.status === 'invited',
      )
      if (invitedTraveler) {
        await supabase
          .from('trip_travelers')
          .update({ status: 'accepted' })
          .eq('trip_id', activeTrip.id)
          .eq('tourist_id', user.id)
      }
      const invitedBuddy = (buddiesRows as any[])?.find(
        (r) => r.buddy_id === user.id && r.status === 'invited',
      )
      if (invitedBuddy) {
        await supabase
          .from('trip_buddies')
          .update({ status: 'accepted' })
          .eq('trip_id', activeTrip.id)
          .eq('buddy_id', user.id)
      }
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
            href={me?.role === 'buddy' ? '/dashboard' : '/dashboard'}
            className="inline-flex items-center gap-2 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
          >
            <ArrowLeft size={14} aria-hidden="true" />
            Back to dashboard
          </Link>
          {me?.role !== 'buddy' ? (
            <Link
              href="/browse"
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

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      <ItineraryHeader
        tripShareToken={trip?.share_token ?? null}
        dashboardHref="/dashboard"
      />

      <ItineraryHero
        title={trip?.title ?? null}
        connection={connection}
        travelers={travelers}
        coBuddies={coBuddies}
        touristName={touristName}
        buddyName={buddyName}
        canEdit={canEdit}
      />

      {trip ? (
        <ItineraryMap
          stops={stops}
          days={days}
          presenceUsers={presenceUsers}
          remoteDrag={remoteDrag}
        />
      ) : null}

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
                aria-label={t.label}
                className={`flex flex-col items-center gap-0.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap border-b-2 -mb-px transition-colors duration-150 ${
                  isActive
                    ? 'border-primary text-primary'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Icon size={14} aria-hidden="true" />
                  {t.label}
                </span>
                <span
                  className="text-[10px] italic"
                  style={{ letterSpacing: '0.02em', opacity: 0.75 }}
                  aria-hidden="true"
                >
                  {t.labelVi}
                </span>
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
              {tab === 'packing' ? (
                <PackingTab trip={trip} canEdit={canEdit} me={me!} onLogActivity={logActivity} />
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      {/* Companion management — collapsed by default; sits outside the tabs. */}
      <details
        className="border border-border rounded-sm bg-surface overflow-hidden"
        aria-label="Manage trip companions"
      >
        <summary className="px-4 py-3 cursor-pointer text-sm font-semibold flex items-center gap-2 hover:bg-paper">
          <Pencil size={13} aria-hidden="true" />
          Manage group
        </summary>
        <div className="p-4 lg:p-6 border-t border-border">
          <p className="text-sm text-muted mb-4">
            Add companions (other travelers in your group) and co-buddies (extra local
            guides). Leads can invite; everyone can see who is on the trip.
          </p>
          {trip ? (
            <ManageCompanions
              tripId={trip.id}
              myId={me?.id ?? ''}
              canManage={canEdit && (me?.id === trip.tourist_id || me?.id === trip.buddy_id)}
              onChange={() => {
                if (connectionId) load(connectionId)
              }}
            />
          ) : null}
        </div>
      </details>

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
