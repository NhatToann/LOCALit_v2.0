'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  Compass,
  Save,
  AlertTriangle,
  Users,
  Clock,
  Phone,
  MessageCircle,
  ArrowLeft,
  Pencil,
  Check,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Connection, Trip, Profile, TripStop } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import { daysUntilExpiry, expiryLabel } from '@/lib/connection-stages'

interface PageProps {
  params: Promise<{ connectionId: string }>
}

export default function SharedItineraryPage({ params }: PageProps) {
  const router = useRouter()
  const [connectionId, setConnectionId] = useState<string | null>(null)
  const [me, setMe] = useState<Profile | null>(null)
  const [connection, setConnection] = useState<Connection | null>(null)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [stops, setStops] = useState<TripStop[]>([])
  const [loading, setLoading] = useState(true)
  const [canEdit, setCanEdit] = useState(false)
  const [savingState, setSavingState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [notes, setNotes] = useState('')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [staleDuration, setStaleDuration] = useState(false)

  // Resolve params (Next.js 16 returns params as a Promise in client components)
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
      .select('*, tourist:tourists(*, profile:profiles(*)), buddy:buddies(*, profile:profiles(*))')
      .eq('id', cid)
      .maybeSingle()

    if (!conn) {
      setLoading(false)
      return
    }
    setConnection(conn as Connection)

    const isTourist = conn.tourist_id === user.id
    const isBuddy = conn.buddy_id === user.id
    if (!isTourist && !isBuddy) {
      setLoading(false)
      return
    }

    // Both participants can edit once status=accepted
    const editable = conn.status === 'accepted'
    setCanEdit(editable)

    // Find a trip that already references this buddy + tourist pair
    const { data: trips } = await supabase
      .from('trips')
      .select('*, tourist:tourists(*, profile:profiles(*)), buddy:buddies(*, profile:profiles(*))')
      .eq('tourist_id', conn.tourist_id)
      .eq('buddy_id', conn.buddy_id)
      .order('updated_at', { ascending: false })
      .limit(1)

    const existingTrip = (trips && trips.length > 0 ? trips[0] : null) as Trip | null
    let activeTrip = existingTrip

    if (!existingTrip) {
      // Auto-create a shared itinerary trip
      const buddyProfile = (conn.buddy as any)?.profile
      const touristProfile = (conn.tourist as any)?.profile
      const title = `Da Nang trip with ${buddyProfile?.full_name ?? 'buddy'}`
      const { data: created } = await supabase
        .from('trips')
        .insert({
          tourist_id: conn.tourist_id,
          buddy_id: conn.buddy_id,
          title,
          destination: 'Da Nang',
          status: 'planning',
        })
        .select()
        .single()
      activeTrip = created as Trip
    }

    if (activeTrip) {
      setTrip(activeTrip)
      setNotes(activeTrip.itinerary_notes ?? '')
      const { data: stopsData } = await supabase
        .from('trip_stops')
        .select('*')
        .eq('trip_id', activeTrip.id)
        .order('stop_order', { ascending: true })
      setStops((stopsData || []) as TripStop[])
    }

    setLoading(false)
  }, [router])

  useEffect(() => {
    if (connectionId) load(connectionId)
  }, [connectionId, load])

  // Debounced autosave: write notes + last-edited attribution after 1.2s idle
  const scheduleSave = useCallback((nextNotes: string) => {
    if (!trip || !me) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    setSavingState('saving')
    setStaleDuration(false)
    saveTimer.current = setTimeout(async () => {
      const supabase = createClient()
      await supabase
        .from('trips')
        .update({
          itinerary_notes: nextNotes,
          itinerary_updated_by: me.id,
          itinerary_updated_at: new Date().toISOString(),
        })
        .eq('id', trip.id)
      setSavingState('saved')
      setStaleDuration(true)
    }, 1200)
  }, [trip, me])

  function onNotesChange(value: string) {
    setNotes(value)
    scheduleSave(value)
  }

  async function addStop() {
    if (!trip) return
    const name = prompt('Name of the next stop?')
    if (!name) return
    const supabase = createClient()
    const order = stops.length
    const { data, error } = await supabase
      .from('trip_stops')
      .insert({
        trip_id: trip.id,
        stop_order: order,
        name: name.trim().slice(0, 120),
        address: null,
      })
      .select()
      .single()
    if (!error && data) {
      setStops([...stops, data as TripStop])
    }
  }

  async function removeStop(stopId: string) {
    const supabase = createClient()
    await supabase.from('trip_stops').delete().eq('id', stopId)
    setStops(stops.filter((s) => s.id !== stopId))
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
          <span>Connection not found.</span>
        </div>
        <Link href="/" className="inline-flex items-center gap-2 mt-4 text-sm text-primary hover:underline">
          <ArrowLeft size={14} /> Back to home
        </Link>
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

  const lastEditor = (() => {
    const who = trip?.itinerary_updated_by
    if (who === me?.id) return 'you'
    if (who === connection.tourist_id) return touristName
    if (who === connection.buddy_id) return buddyName
    return null
  })()

  return (
    <div className="container-page py-8 lg:py-12 space-y-6">
      <Link href="/tourist/dashboard" className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
        <ArrowLeft size={14} aria-hidden="true" />
        Back
      </Link>

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
            Both {touristName} and {buddyName} can edit this page. Changes save automatically.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Avatar name={touristName} src={touristAvatar} size="sm" />
              <span className="text-sm text-ink font-medium">{touristName}</span>
              <Users size={14} className="text-subtle mx-1" aria-hidden="true" />
              <Avatar name={buddyName} src={buddyAvatar} size="sm" />
              <span className="text-sm text-ink font-medium">{buddyName}</span>
            </div>
            <span className="hidden sm:inline text-subtle">·</span>
            <span className={`badge badge-${connection.status === 'accepted' ? 'success' : connection.status === 'declined' ? 'danger' : 'warning'}`}>
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
                Editing unlocks once the buddy accepts the connection.
                You can still read the plan.
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
          href={`/tourist/trips`}
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

      {/* Shared notes editor */}
      <section className="border border-border rounded-sm bg-surface" aria-labelledby="notes-title">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 id="notes-title" className="text-lg font-semibold">
              Shared plan
            </h2>
            <p className="text-sm text-muted">
              {lastEditor ? `Last edited by ${lastEditor}` : 'No edits yet'}
              {lastEditor && trip?.itinerary_updated_at
                ? ` · ${new Date(trip.itinerary_updated_at).toLocaleString('en-US')}`
                : ''}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            {savingState === 'saving' ? (
              <span className="inline-flex items-center gap-1 text-muted">
                <span className="loading-spinner w-3 h-3" aria-hidden="true" />
                Saving…
              </span>
            ) : savingState === 'saved' ? (
              <span className="inline-flex items-center gap-1 text-success">
                <Check size={12} aria-hidden="true" />
                Saved
              </span>
            ) : null}
          </div>
        </header>
        <div className="p-6">
          <textarea
            value={notes}
            onChange={(e) => onNotesChange(e.target.value)}
            disabled={!canEdit}
            rows={10}
            maxLength={5000}
            aria-label="Shared itinerary notes"
            placeholder={`Day 1\n09:00  Meet at Han Market\n10:30  Cồn Market for breakfast\n14:00  Marble Mountains\n\nDay 2\n…`}
            className="w-full p-3 border border-border rounded-sm bg-paper text-sm text-ink font-mono leading-relaxed focus:outline-none focus:border-primary"
          />
          <p className="text-xs text-muted mt-2 flex items-center gap-1">
            <Pencil size={11} aria-hidden="true" />
            Autosaves 1.2 s after your last keystroke. Both parties see updates instantly.
          </p>
        </div>
      </section>

      {/* Stops builder */}
      <section className="border border-border rounded-sm bg-surface" aria-labelledby="stops-title">
        <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-3">
          <div>
            <h2 id="stops-title" className="text-lg font-semibold">
              Stops on the map
            </h2>
            <p className="text-sm text-muted">{stops.length} stop{stops.length === 1 ? '' : 's'} added.</p>
          </div>
          {canEdit ? (
            <button
              type="button"
              onClick={addStop}
              className="inline-flex items-center gap-1 h-8 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              <Save size={14} aria-hidden="true" />
              Add stop
            </button>
          ) : null}
        </header>
        <div className="p-6">
          {stops.length === 0 ? (
            <p className="text-sm text-muted text-center py-6">
              No stops yet. Use the shared plan above to sketch the day, then add geo-pinned stops here.
            </p>
          ) : (
            <ol className="space-y-2">
              {stops.map((s, i) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 px-3 py-2 border border-border rounded-sm bg-paper"
                >
                  <span className="inline-flex items-center justify-center w-6 h-6 rounded-sm bg-primary text-paper text-xs font-semibold">
                    {i + 1}
                  </span>
                  <span className="flex-1 text-sm text-ink truncate">{s.name}</span>
                  {s.address ? (
                    <span className="text-xs text-muted truncate hidden sm:inline">{s.address}</span>
                  ) : null}
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => removeStop(s.id)}
                      className="text-xs text-danger hover:underline"
                    >
                      Remove
                    </button>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </div>
      </section>

      {/* Save visible status pill */}
      <noscript>This page requires JavaScript for real-time edits.</noscript>
    </div>
  )
}
