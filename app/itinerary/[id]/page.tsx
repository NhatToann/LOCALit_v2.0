'use client'

import { useEffect, useState, useTransition, useCallback, useMemo } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  MapPin,
  Calendar,
  Compass,
  Pencil,
  Trash2,
  Plus,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Users,
  Share2,
  Copy,
  UserPlus,
  CheckCheck,
  XCircle,
  Eye,
  Edit3,
  Briefcase,
  Link2,
  Clock,
  Hourglass,
  Banknote,
  Car,
  DoorOpen,
  Tag,
  LayoutGrid,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type {
  Itinerary,
  ItineraryDay,
  ItineraryStop,
  ItineraryCollaborator,
  Profile,
  ItineraryShare,
} from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'
import ItineraryDayBoard from '@/components/itinerary/ItineraryDayBoard'

const today = () => new Date().toISOString().slice(0, 10)

type Tab = 'overview' | 'board' | 'days' | 'stops' | 'collaborators' | 'settings'

// Form payload for addStop/updateStop — single source of truth.
type StopFormFields = {
  name: string
  address: string
  notes: string
  planned_time: string
  duration_minutes: number | null
  category: 'food' | 'sight' | 'transport' | 'stay' | 'activity' | 'other' | ''
  transport: 'walk' | 'scooter' | 'taxi' | 'bike' | 'car' | ''
  transport_note: string
  opening_hours: string
  est_cost_cents: number | null
  photo_url: string
}

const STOP_CATEGORIES: Array<{ v: StopFormFields['category']; label: string }> = [
  { v: '', label: '— pick one —' },
  { v: 'sight', label: 'Sight' },
  { v: 'food', label: 'Food' },
  { v: 'activity', label: 'Activity' },
  { v: 'transport', label: 'Transport' },
  { v: 'stay', label: 'Stay' },
  { v: 'other', label: 'Other' },
]
const TRANSPORT_OPTIONS: Array<{ v: StopFormFields['transport']; label: string }> = [
  { v: '', label: '— pick one —' },
  { v: 'walk', label: 'Walk' },
  { v: 'scooter', label: 'Scooter' },
  { v: 'taxi', label: 'Taxi' },
  { v: 'bike', label: 'Bike' },
  { v: 'car', label: 'Car' },
]

// Compute total minutes spent at stops in a day, plus earliest start /
// latest end so the user can see whether the day is realistic.
function computeDayTimeline(stops: ItineraryStop[]) {
  let totalDuration = 0
  let earliestStart: number | null = null // minutes since 00:00
  let latestEnd: number | null = null
  for (const s of stops) {
    if (s.duration_minutes) totalDuration += s.duration_minutes
    if (s.planned_time) {
      const [hh, mm] = s.planned_time.slice(0, 5).split(':').map(Number)
      if (!Number.isNaN(hh) && !Number.isNaN(mm)) {
        const start = hh * 60 + mm
        if (earliestStart === null || start < earliestStart) earliestStart = start
        const end = start + (s.duration_minutes ?? 0)
        if (latestEnd === null || end > latestEnd) latestEnd = end
      }
    }
  }
  const fmt = (mins: number) => {
    const h = Math.floor(mins / 60)
    const m = mins % 60
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
  }
  return {
    totalDuration,
    earliestStart: earliestStart === null ? null : fmt(earliestStart),
    latestEnd: latestEnd === null ? null : fmt(latestEnd),
    span: earliestStart !== null && latestEnd !== null ? latestEnd - earliestStart : null,
    hasAnyTime: stops.some((s) => s.planned_time),
  }
}

export default function ItineraryDetailPage() {
  const params = useParams()
  const router = useRouter()
  const id = params?.id as string
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [stops, setStops] = useState<ItineraryStop[]>([])
  const [collaborators, setCollaborators] = useState<ItineraryCollaborator[]>([])
  const [share, setShare] = useState<ItineraryShare | null>(null)
  const [owner, setOwner] = useState<Profile | null>(null)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const [tab, setTab] = useState<Tab>('overview')

  // Local edit state
  const [editingItin, setEditingItin] = useState(false)
  const [editingDayId, setEditingDayId] = useState<string | null>(null)
  const [addingDay, setAddingDay] = useState(false)
  const [editingStopId, setEditingStopId] = useState<string | null>(null)
  const [addingStop, setAddingStop] = useState<string | null>(null) // dayId or 'unassigned'
  const [inviteEmail, setInviteEmail] = useState('')

  const isOwner = !!itin && currentUser?.id === itin.owner_id
  const isEditor = isOwner || collaborators.some(
    (c) => c.user_id === currentUser?.id && c.status === 'accepted' && (c.role === 'owner' || c.role === 'editor'),
  )
  const canView = isEditor || collaborators.some(
    (c) => c.user_id === currentUser?.id && c.status === 'accepted',
  )

  const load = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=/itinerary/${id}`)
      return
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle<Profile>()
    setCurrentUser(profile ?? null)

    const { data: itinRow, error: e1 } = await supabase
      .from('itineraries')
      .select('*')
      .eq('id', id)
      .maybeSingle<Itinerary>()
    if (e1) {
      setLoadError(e1.message)
      setLoading(false)
      return
    }
    if (!itinRow) {
      setLoadError('Itinerary not found, or you do not have access.')
      setLoading(false)
      return
    }

    const [
      { data: ownerRow },
      { data: daysRows },
      { data: stopsRows },
      { data: collabRows },
      { data: shareRow },
    ] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', itinRow.owner_id).maybeSingle<Profile>(),
      supabase.from('itinerary_days').select('*').eq('itinerary_id', id).order('day_order', { ascending: true }),
      supabase.from('itinerary_stops').select('*').eq('itinerary_id', id).order('day_id', { ascending: true, nullsFirst: true }).order('stop_order', { ascending: true }),
      supabase
        .from('itinerary_collaborators')
        .select('*, user:safe_profiles!itinerary_collaborators_user_id_fkey(id, full_name, avatar_url, email), inviter:safe_profiles!itinerary_collaborators_invited_by_fkey(id, full_name, avatar_url)')
        .eq('itinerary_id', id)
        .order('invited_at', { ascending: true }),
      supabase.from('itinerary_share').select('*').eq('itinerary_id', id).maybeSingle<ItineraryShare>(),
    ])

    setItin(itinRow)
    setOwner(ownerRow ?? null)
    setDays((daysRows as ItineraryDay[]) ?? [])
    setStops((stopsRows as ItineraryStop[]) ?? [])
    setCollaborators((collabRows as ItineraryCollaborator[]) ?? [])
    setShare((shareRow as ItineraryShare) ?? null)
    setLoading(false)
  }, [id, router])

  useEffect(() => { load() }, [load])

  // Realtime subscribe
  useEffect(() => {
    if (!id) return
    const supabase = createClient()
    const ch = supabase
      .channel(`itin-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itineraries', filter: `id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_days', filter: `itinerary_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_stops', filter: `itinerary_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_collaborators', filter: `itinerary_id=eq.${id}` }, () => load())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'itinerary_share', filter: `itinerary_id=eq.${id}` }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [id, load])

  // ---------- Itinerary edits ----------
  async function patchItin(patch: Partial<Itinerary>) {
    if (!itin) return
    setActionError(null)
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('itineraries')
        .update({ ...patch, last_editor_id: currentUser?.id ?? null })
        .eq('id', itin.id)
      if (error) { setActionError(error.message); return }
      setItin({ ...itin, ...patch })
      setEditingItin(false)
    })
  }

  async function deleteItin() {
    if (!itin) return
    if (!window.confirm('Delete this itinerary and all its stops? This cannot be undone.')) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('itineraries').delete().eq('id', itin.id)
      if (error) { setActionError(error.message); return }
      router.push('/dashboard')
    })
  }

  // ---------- Day edits ----------
  async function addDay(input: { title: string; date: string; notes: string }) {
    if (!itin) return
    startTransition(async () => {
      const supabase = createClient()
      const order = days.length > 0 ? Math.max(...days.map((d) => d.day_order)) + 1 : 1
      const { data, error } = await supabase
        .from('itinerary_days')
        .insert({
          itinerary_id: itin.id,
          day_order: order,
          title: input.title.trim() || null,
          date: input.date || null,
          notes: input.notes.trim() || null,
        })
        .select()
        .single()
      if (error || !data) { setActionError(error?.message ?? 'Failed'); return }
      setDays([...days, data as ItineraryDay])
      setAddingDay(false)
    })
  }

  async function updateDay(dayId: string, patch: Partial<ItineraryDay>) {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('itinerary_days').update(patch).eq('id', dayId)
      if (error) { setActionError(error.message); return }
      setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)))
      setEditingDayId(null)
    })
  }

  async function deleteDay(dayId: string) {
    if (!window.confirm('Delete this day and its stops?')) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('itinerary_days').delete().eq('id', dayId)
      if (error) { setActionError(error.message); return }
      setDays((prev) => prev.filter((d) => d.id !== dayId))
      setStops((prev) => prev.filter((s) => s.day_id !== dayId))
    })
  }

  // ---------- Stop edits ----------
  async function addStop(dayId: string | null, input: StopFormFields) {
    if (!itin) return
    startTransition(async () => {
      const supabase = createClient()
      const peer = stops.filter((s) => s.day_id === dayId)
      const order = peer.length > 0 ? Math.max(...peer.map((s) => s.stop_order)) + 1 : 1
      const { data, error } = await supabase
        .from('itinerary_stops')
        .insert({
          itinerary_id: itin.id,
          day_id: dayId,
          stop_order: order,
          name: input.name.trim(),
          address: input.address.trim() || null,
          notes: input.notes.trim() || null,
          planned_time: input.planned_time || null,
          duration_minutes: input.duration_minutes || null,
          category: input.category || null,
          transport: input.transport || null,
          transport_note: input.transport_note?.trim() || null,
          opening_hours: input.opening_hours?.trim() || null,
          est_cost_cents: input.est_cost_cents || null,
          photo_url: input.photo_url?.trim() || null,
          added_by: currentUser?.id ?? null,
        })
        .select()
        .single()
      if (error || !data) { setActionError(error?.message ?? 'Failed'); return }
      setStops([...stops, data as ItineraryStop])
      setAddingStop(null)
    })
  }

  async function updateStop(stopId: string, patch: Partial<ItineraryStop>) {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('itinerary_stops').update(patch).eq('id', stopId)
      if (error) { setActionError(error.message); return }
      setStops((prev) => prev.map((s) => (s.id === stopId ? { ...s, ...patch } : s)))
      setEditingStopId(null)
    })
  }

  async function deleteStop(stopId: string) {
    if (!window.confirm('Remove this stop?')) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase.from('itinerary_stops').delete().eq('id', stopId)
      if (error) { setActionError(error.message); return }
      setStops((prev) => prev.filter((s) => s.id !== stopId))
    })
  }

  // ---------- Collaborators ----------
  async function inviteCollaborator(email: string, role: 'editor' | 'viewer') {
    if (!itin) return
    if (!email.trim()) return
    startTransition(async () => {
      const supabase = createClient()
      // Look up user by email via safe_profiles (which exposes email-ish... actually safe_profiles doesn't.
      // We need a different approach: query profiles (only if authed) to get id by email.
      const { data: target, error: lookupErr } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .eq('email', email.trim().toLowerCase())
        .maybeSingle<{ id: string; full_name: string; email: string }>()
      if (lookupErr || !target) {
        setActionError(lookupErr?.message ?? `No LOCALit account with email ${email}. Ask them to sign up first.`)
        return
      }
      if (target.id === itin.owner_id) {
        setActionError('That person is already the owner.')
        return
      }
      const { error } = await supabase
        .from('itinerary_collaborators')
        .upsert(
          {
            itinerary_id: itin.id,
            user_id: target.id,
            role,
            status: 'invited',
            invited_by: currentUser?.id ?? null,
            invited_at: new Date().toISOString(),
          },
          { onConflict: 'itinerary_id,user_id' },
        )
      if (error) { setActionError(error.message); return }
      setInviteEmail('')
      load()
    })
  }

  async function respondToInvite(collabId: string, accept: boolean) {
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('itinerary_collaborators')
        .update({
          status: accept ? 'accepted' : 'declined',
          responded_at: new Date().toISOString(),
        })
        .eq('id', collabId)
      if (error) { setActionError(error.message); return }
      load()
    })
  }

  async function revokeCollaborator(collabId: string) {
    if (!window.confirm('Revoke this collaborator?')) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('itinerary_collaborators')
        .update({ status: 'revoked' })
        .eq('id', collabId)
      if (error) { setActionError(error.message); return }
      load()
    })
  }

  // ---------- Share ----------
  async function ensureShareToken() {
    if (!itin) return
    startTransition(async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('itinerary_share')
        .upsert(
          { itinerary_id: itin.id, enabled: true, created_at: new Date().toISOString() },
          { onConflict: 'itinerary_id' },
        )
        .select()
        .single()
      if (error) { setActionError(error.message); return }
      setShare(data as ItineraryShare)
    })
  }

  async function toggleShare(enabled: boolean) {
    if (!itin) return
    if (!share) return
    startTransition(async () => {
      const supabase = createClient()
      const { error } = await supabase
        .from('itinerary_share')
        .update({ enabled })
        .eq('itinerary_id', itin.id)
      if (error) { setActionError(error.message); return }
      setShare({ ...share, enabled })
    })
  }

  const shareUrl = share?.token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/itinerary/share/${share.token}` : ''

  const dayCount = useMemo(() => {
    if (!itin?.start_date || !itin?.end_date) return null
    return Math.max(
      1,
      Math.round(
        (new Date(itin.end_date).getTime() - new Date(itin.start_date).getTime()) /
          (1000 * 60 * 60 * 24),
      ) + 1,
    )
  }, [itin?.start_date, itin?.end_date])

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }
  if (!itin) {
    return (
      <div className="container-page py-16">
        <div className="alert alert-error mb-4" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{loadError ?? 'Itinerary not found.'}</span>
        </div>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={14} aria-hidden="true" /> Back to dashboard
        </Link>
      </div>
    )
  }
  if (!canView && !isOwner) {
    return (
      <div className="container-page py-16">
        <p className="text-muted mb-2">You do not have access to this itinerary.</p>
        <Link href="/dashboard" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={14} aria-hidden="true" /> Back to dashboard
        </Link>
      </div>
    )
  }

  const statusBadge =
    itin.status === 'confirmed' ? 'badge-success'
      : itin.status === 'completed' ? 'badge-info'
        : itin.status === 'cancelled' ? 'badge-danger'
          : 'badge-warning'

  const myInvite = collaborators.find(
    (c) => c.user_id === currentUser?.id && c.status === 'invited' && c.user_id !== itin.owner_id,
  )

  return (
    <div className="container-page py-6 lg:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/dashboard" className="hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft size={11} aria-hidden="true" /> Dashboard
        </Link>
        <span aria-hidden="true">/</span>
        <Link href="/itinerary" className="hover:text-ink">
          Itineraries
        </Link>
        <span aria-hidden="true">/</span>
        <span className="text-ink truncate max-w-[40ch]">{itin.title}</span>
      </nav>

      {/* Compact header — flat, no cover photo */}
      <header className="pb-4 border-b border-border">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-eyebrow text-primary mb-2">
              Itinerary
              <span className="ml-2 italic text-muted" style={{ letterSpacing: '0.02em' }} aria-hidden="true">
                lịch trình
              </span>
            </p>
            <h1 className="text-page-title mb-2">{itin.title}</h1>
            <p className="text-sm text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-1">
              <MapPin size={13} aria-hidden="true" /> {itin.destination}
              {itin.start_date ? (
                <>
                  <span className="mx-1 text-subtle" aria-hidden="true">·</span>
                  <Calendar size={13} aria-hidden="true" />
                  <span style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {new Date(itin.start_date).toLocaleDateString('en-US')}
                    {' – '}
                    {itin.end_date ? new Date(itin.end_date).toLocaleDateString('en-US') : '…'}
                  </span>
                </>
              ) : null}
              {owner ? (
                <>
                  <span className="mx-1 text-subtle" aria-hidden="true">·</span>
                  <Users size={13} aria-hidden="true" /> {owner.full_name}
                </>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`badge ${statusBadge} text-xs`}>{itin.status}</span>
            {dayCount !== null ? (
              <span className="badge badge-success text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {dayCount} day{dayCount === 1 ? '' : 's'}
              </span>
            ) : null}
            <span className="badge badge-primary text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {stops.length} stop{stops.length === 1 ? '' : 's'}
            </span>
            <span className="badge badge-info text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
              {collaborators.filter((c) => c.status === 'accepted').length + 1} on team
            </span>
            {!isEditor ? (
              <span className="badge badge-warning text-xs">
                <Eye size={10} className="inline mr-1" aria-hidden="true" /> View only
              </span>
            ) : null}
          </div>
        </div>
      </header>

      {loadError ? (
        <div className="alert alert-error" role="alert">
          <AlertTriangle size={14} aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      ) : null}
      {actionError ? (
        <div className="alert alert-error" role="alert">
          <X size={14} aria-hidden="true" />
          <span>{actionError}</span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss"
            className="ml-auto text-muted hover:text-ink"
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>
      ) : null}

      {myInvite ? (
        <div className="border border-info bg-info-bg text-info rounded-sm p-4 flex flex-wrap items-center gap-3" role="status">
          <UserPlus size={16} aria-hidden="true" />
          <p className="text-sm flex-1">
            <strong>{owner?.full_name ?? 'Someone'}</strong> invited you to collaborate on <strong>{itin.title}</strong> as {myInvite.role}.
          </p>
          <button
            type="button"
            onClick={() => respondToInvite(myInvite.id, true)}
            disabled={isPending}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-success text-paper border border-success hover:opacity-90"
          >
            <CheckCheck size={14} aria-hidden="true" /> Accept
          </button>
          <button
            type="button"
            onClick={() => respondToInvite(myInvite.id, false)}
            disabled={isPending}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <XCircle size={14} aria-hidden="true" /> Decline
          </button>
        </div>
      ) : null}

      {/* Tabs */}
      <nav className="border-b border-border flex flex-wrap" role="tablist" aria-label="Itinerary sections">
        {([
          { v: 'overview', label: 'Overview', icon: Compass },
          { v: 'board', label: 'Board', icon: LayoutGrid, count: stops.length },
          { v: 'days', label: 'Days', icon: Calendar, count: days.length },
          { v: 'stops', label: 'Stops', icon: MapPin, count: stops.length },
          { v: 'collaborators', label: 'Collaborators', icon: Users, count: collaborators.length + 1 },
          { v: 'settings', label: 'Settings', icon: Edit3 },
        ] as const).map((t) => {
          const Icon = t.icon
          const active = tab === t.v
          return (
            <button
              key={t.v}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.v as Tab)}
              className={`px-3 h-10 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1 ${active ? 'border-primary text-primary' : 'border-transparent text-muted hover:text-ink'}`}
            >
              <Icon size={13} aria-hidden="true" /> {t.label}
              {'count' in t && typeof t.count === 'number' ? (
                <span className="text-[10px] tabular-nums text-subtle">({t.count})</span>
              ) : null}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' ? (
        <OverviewTab
          itin={itin}
          days={days}
          stops={stops}
          collaborators={collaborators}
          isEditor={isEditor}
          editing={editingItin}
          onStartEdit={() => setEditingItin(true)}
          onCancelEdit={() => setEditingItin(false)}
          onSave={patchItin}
          onDelete={deleteItin}
          saving={isPending}
        />
      ) : null}

      {tab === 'board' ? (
        <BoardTab
          days={days}
          stops={stops}
          isEditor={isEditor}
          meId={currentUser?.id ?? ''}
          onCardClick={(stopId) => {
            const s = stops.find((x) => x.id === stopId)
            if (s) setEditingStopId(stopId)
          }}
        />
      ) : null}

      {tab === 'days' ? (
        <DaysTab
          days={days}
          stops={stops}
          isEditor={isEditor}
          onAdd={addDay}
          onUpdate={updateDay}
          onDelete={deleteDay}
          editingDayId={editingDayId}
          setEditingDayId={setEditingDayId}
          addingDay={addingDay}
          setAddingDay={setAddingDay}
          saving={isPending}
        />
      ) : null}

      {tab === 'stops' ? (
        <StopsTab
          days={days}
          stops={stops}
          isEditor={isEditor}
          onAdd={addStop}
          onUpdate={updateStop}
          onDelete={deleteStop}
          editingStopId={editingStopId}
          setEditingStopId={setEditingStopId}
          addingStop={addingStop}
          setAddingStop={setAddingStop}
          saving={isPending}
        />
      ) : null}

      {tab === 'collaborators' ? (
        <CollaboratorsTab
          owner={owner}
          collaborators={collaborators}
          isOwner={isOwner}
          share={share}
          shareUrl={shareUrl}
          inviteEmail={inviteEmail}
          setInviteEmail={setInviteEmail}
          onInvite={inviteCollaborator}
          onRevoke={revokeCollaborator}
          onEnsureShare={ensureShareToken}
          onToggleShare={toggleShare}
          saving={isPending}
        />
      ) : null}

      {tab === 'settings' ? (
        <SettingsTab
          itin={itin}
          isOwner={isOwner}
          onSave={patchItin}
          onDelete={deleteItin}
          editing={editingItin}
          setEditing={setEditingItin}
          saving={isPending}
        />
      ) : null}
    </div>
  )
}

// =====================================================================
// Board tab — Trello-style drag-drop across morning/afternoon/evening
// =====================================================================
function BoardTab({
  days,
  stops,
  isEditor,
  meId,
  onCardClick,
}: {
  days: ItineraryDay[]
  stops: ItineraryStop[]
  isEditor: boolean
  meId: string
  onCardClick: (stopId: string) => void
}) {
  const [activeDayId, setActiveDayId] = useState<string | null>(days[0]?.id ?? null)
  const [conflictMessage, setConflictMessage] = useState<string | null>(null)

  // If days list shrinks and the active one disappears, fall back.
  useEffect(() => {
    if (days.length === 0) {
      setActiveDayId(null)
      return
    }
    if (!activeDayId || !days.some((d) => d.id === activeDayId)) {
      setActiveDayId(days[0].id)
    }
  }, [days, activeDayId])

  const activeDay = days.find((d) => d.id === activeDayId) ?? null
  const dayStops = activeDay
    ? stops
        .filter((s) => s.day_id === activeDay.id)
        .sort((a, b) => (a.stop_order ?? 0) - (b.stop_order ?? 0))
    : []

  if (days.length === 0) {
    return (
      <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
        <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
          <LayoutGrid size={11} aria-hidden="true" /> Board
        </legend>
        <div className="border border-dashed border-border rounded-sm p-6 bg-paper text-center">
          <LayoutGrid size={20} className="mx-auto text-muted mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-ink mb-1">No days yet</p>
          <p className="text-xs text-muted">
            Add a day on the <strong>Days</strong> tab first, then come back here to drag stops between morning, afternoon and evening.
          </p>
        </div>
      </fieldset>
    )
  }

  return (
    <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
      <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
        <LayoutGrid size={11} aria-hidden="true" /> Board
      </legend>

      {/* Day selector chips */}
      <nav className="flex flex-wrap gap-1.5 mb-4" aria-label="Select day">
        {days.map((d) => {
          const active = d.id === activeDayId
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => setActiveDayId(d.id)}
              aria-pressed={active}
              className={[
                'inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm border transition-colors',
                active
                  ? 'border-primary text-primary bg-primary/5'
                  : 'border-border text-ink hover:bg-paper',
              ].join(' ')}
            >
              <span className="tabular-nums font-semibold">D{d.day_order}</span>
              <span className="text-muted truncate max-w-[120px]">
                {d.title || (d.date ? new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Untitled')}
              </span>
            </button>
          )
        })}
      </nav>

      {conflictMessage ? (
        <div className="mb-3 px-3 py-2 bg-warning-bg border border-warning rounded-sm text-xs text-warning inline-flex items-center gap-2" role="status">
          <AlertTriangle size={12} aria-hidden="true" />
          {conflictMessage}
        </div>
      ) : null}

      {activeDay ? (
        <ItineraryDayBoard
          dayId={activeDay.id}
          initialStops={dayStops}
          canEdit={isEditor}
          meId={meId}
          onCardClick={onCardClick}
          onConflict={(stopName) =>
            setConflictMessage(`${stopName} was just moved by another collaborator — refresh to see the latest.`)
          }
        />
      ) : null}
    </fieldset>
  )
}

// =====================================================================
// Overview tab
// =====================================================================
function OverviewTab({
  itin,
  days,
  stops,
  collaborators,
  isEditor,
  editing,
  onStartEdit,
  onCancelEdit,
  onSave,
  onDelete,
  saving,
}: {
  itin: Itinerary
  days: ItineraryDay[]
  stops: ItineraryStop[]
  collaborators: ItineraryCollaborator[]
  isEditor: boolean
  editing: boolean
  onStartEdit: () => void
  onCancelEdit: () => void
  onSave: (patch: Partial<Itinerary>) => Promise<void>
  onDelete: () => Promise<void>
  saving: boolean
}) {
  const accepted = collaborators.filter((c) => c.status === 'accepted')
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-2 space-y-4">
        <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Compass size={11} aria-hidden="true" /> Trip details
          </legend>
          {editing ? (
            <ItinEditForm
              itin={itin}
              onCancel={onCancelEdit}
              onSave={onSave}
              saving={saving}
            />
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                <div>
                  <dt className="text-[10px] tracking-wide uppercase text-muted">Title</dt>
                  <dd className="text-sm text-ink">{itin.title}</dd>
                </div>
                <div>
                  <dt className="text-[10px] tracking-wide uppercase text-muted">Dates</dt>
                  <dd className="text-sm text-ink" style={{ fontVariantNumeric: 'tabular-nums' }}>
                    {itin.start_date ? new Date(itin.start_date).toLocaleDateString('en-US') : '—'}
                    {' → '}
                    {itin.end_date ? new Date(itin.end_date).toLocaleDateString('en-US') : '—'}
                  </dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-[10px] tracking-wide uppercase text-muted">Notes</dt>
                  <dd className="text-sm text-ink leading-relaxed">
                    {itin.notes ? itin.notes : <span className="text-subtle italic">No notes yet.</span>}
                  </dd>
                </div>
              </dl>
              {isEditor ? (
                <div className="flex flex-wrap gap-2 pt-2 border-t border-border">
                  <button
                    type="button"
                    onClick={onStartEdit}
                    className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                  >
                    <Pencil size={13} aria-hidden="true" /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={onDelete}
                    disabled={saving}
                    className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-danger border border-border-strong hover:bg-danger-bg disabled:opacity-50"
                  >
                    <Trash2 size={13} aria-hidden="true" /> Delete itinerary
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </fieldset>
        <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Briefcase size={11} aria-hidden="true" /> Plan snapshot
          </legend>
          <dl className="grid grid-cols-3 gap-3">
            <div>
              <dt className="text-[10px] uppercase text-muted">Days</dt>
              <dd className="text-lg font-semibold tabular-nums">{days.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-muted">Stops</dt>
              <dd className="text-lg font-semibold tabular-nums">{stops.length}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase text-muted">Editors</dt>
              <dd className="text-lg font-semibold tabular-nums">{accepted.length}</dd>
            </div>
          </dl>
        </fieldset>
      </div>
      <aside className="space-y-4">
        <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-4">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <Users size={11} aria-hidden="true" /> Team
          </legend>
          <ul className="space-y-2">
            <li className="flex items-center gap-2">
              <Avatar name={itin.owner?.full_name ?? 'Owner'} size="sm" />
              <div className="min-w-0">
                <p className="text-sm text-ink truncate">{itin.owner?.full_name ?? 'Owner'}</p>
                <p className="text-xs text-muted">Owner</p>
              </div>
            </li>
            {accepted.map((c) => (
              <li key={c.id} className="flex items-center gap-2">
                <Avatar name={c.user?.full_name ?? 'Collaborator'} src={c.user?.avatar_url} size="sm" />
                <div className="min-w-0">
                  <p className="text-sm text-ink truncate">{c.user?.full_name ?? 'Collaborator'}</p>
                  <p className="text-xs text-muted capitalize">{c.role}</p>
                </div>
              </li>
            ))}
            {accepted.length === 0 ? (
              <li className="text-xs text-subtle italic">No collaborators yet. Invite one from the Collaborators tab.</li>
            ) : null}
          </ul>
        </fieldset>
      </aside>
    </div>
  )
}

function ItinEditForm({
  itin,
  onCancel,
  onSave,
  saving,
}: {
  itin: Itinerary
  onCancel: () => void
  onSave: (patch: Partial<Itinerary>) => Promise<void>
  saving: boolean
}) {
  const [title, setTitle] = useState(itin.title)
  const [startDate, setStartDate] = useState(itin.start_date ?? '')
  const [endDate, setEndDate] = useState(itin.end_date ?? '')
  const [notes, setNotes] = useState(itin.notes ?? '')
  const [status, setStatus] = useState<Itinerary['status']>(itin.status)
  const [meetupPoint, setMeetupPoint] = useState(itin.meetup_point ?? '')
  const [transport, setTransport] = useState(itin.transport ?? '')
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        if (!title.trim()) return
        if (endDate && startDate && endDate < startDate) return
        await onSave({
          title: title.trim(),
          start_date: startDate || null,
          end_date: endDate || null,
          notes: notes.trim() || null,
          status,
          meetup_point: meetupPoint.trim() || null,
          transport: transport.trim() || null,
        })
      }}
      className="space-y-3"
    >
      <div className="form-group">
        <label htmlFor="itin-title" className="form-label">Title <span className="text-danger" aria-hidden="true">*</span></label>
        <input id="itin-title" type="text" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} className="form-input" />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="form-group">
          <label htmlFor="itin-start" className="form-label">Start</label>
          <input id="itin-start" type="date" min={today()} value={startDate} onChange={(e) => setStartDate(e.target.value)} className="form-input" />
        </div>
        <div className="form-group">
          <label htmlFor="itin-end" className="form-label">End</label>
          <input id="itin-end" type="date" min={startDate || today()} value={endDate} onChange={(e) => setEndDate(e.target.value)} className="form-input" />
        </div>
        <div className="form-group">
          <label htmlFor="itin-status" className="form-label">Status</label>
          <select id="itin-status" value={status} onChange={(e) => setStatus(e.target.value as Itinerary['status'])} className="form-input">
            <option value="planning">planning</option>
            <option value="confirmed">confirmed</option>
            <option value="completed">completed</option>
            <option value="cancelled">cancelled</option>
          </select>
        </div>
      </div>
      <div className="form-group">
        <label htmlFor="itin-meetup" className="form-label">Meetup point</label>
        <input id="itin-meetup" type="text" maxLength={300} value={meetupPoint} onChange={(e) => setMeetupPoint(e.target.value)} className="form-input" placeholder="e.g. Han Market main gate" />
      </div>
      <div className="form-group">
        <label htmlFor="itin-transport" className="form-label">Transport</label>
        <input id="itin-transport" type="text" maxLength={100} value={transport} onChange={(e) => setTransport(e.target.value)} className="form-input" placeholder="e.g. motorbike, car, walking, mixed" />
      </div>
      <div className="form-group">
        <label htmlFor="itin-notes" className="form-label">Notes for your team</label>
        <textarea id="itin-notes" rows={3} maxLength={1000} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-input form-textarea" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving || !title.trim()} className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} Save
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper">
          <X size={13} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  )
}

// =====================================================================
// Days tab
// =====================================================================
function DaysTab({
  days,
  stops,
  isEditor,
  onAdd,
  onUpdate,
  onDelete,
  editingDayId,
  setEditingDayId,
  addingDay,
  setAddingDay,
  saving,
}: {
  days: ItineraryDay[]
  stops: ItineraryStop[]
  isEditor: boolean
  onAdd: (input: { title: string; date: string; notes: string }) => Promise<void>
  onUpdate: (id: string, patch: Partial<ItineraryDay>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  editingDayId: string | null
  setEditingDayId: (id: string | null) => void
  addingDay: boolean
  setAddingDay: (b: boolean) => void
  saving: boolean
}) {
  return (
    <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
      <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
        <Calendar size={11} aria-hidden="true" /> Days
      </legend>
      {days.length === 0 && !addingDay ? (
        <div className="border border-dashed border-border rounded-sm p-6 bg-paper text-center">
          <Calendar size={20} className="mx-auto text-muted mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-ink mb-1">No days yet</p>
          <p className="text-xs text-muted mb-3">Add the first day of your trip. You can add stops to it afterwards.</p>
          {isEditor ? (
            <button
              type="button"
              onClick={() => setAddingDay(true)}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              <Plus size={14} aria-hidden="true" /> Add first day
            </button>
          ) : null}
        </div>
      ) : (
        <ol className="border-t border-border first:border-t-0 -mx-5">
          {days.map((d) => {
            const dayStops = stops.filter((s) => s.day_id === d.id)
            return (
              <li key={d.id} className="border-b border-border last:border-b-0">
                {editingDayId === d.id ? (
                  <div className="px-5 py-4">
                    <DayEditForm
                      day={d}
                      onCancel={() => setEditingDayId(null)}
                      onSave={(p) => onUpdate(d.id, p)}
                      saving={saving}
                    />
                  </div>
                ) : (
                  <div className="flex items-start gap-3 px-5 py-4">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-primary text-paper text-xs font-semibold flex-shrink-0 tabular-nums" aria-hidden="true">
                      {d.day_order}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {d.title || `Day ${d.day_order}`}
                        {d.date ? <span className="ml-2 text-xs text-muted tabular-nums">{new Date(d.date).toLocaleDateString('en-US')}</span> : null}
                      </p>
                      {d.notes ? <p className="text-xs text-ink mt-1">{d.notes}</p> : null}
                      <p className="text-xs text-muted mt-1 inline-flex items-center gap-1">
                        <MapPin size={11} aria-hidden="true" /> {dayStops.length} stop{dayStops.length === 1 ? '' : 's'}
                      </p>
                    </div>
                    {isEditor ? (
                      <div className="flex flex-col gap-1 flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingDayId(d.id)}
                          aria-label={`Edit day ${d.day_order}`}
                          className="inline-flex items-center justify-center w-7 h-7 text-ink hover:bg-paper border border-border rounded-sm"
                        >
                          <Pencil size={12} aria-hidden="true" />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDelete(d.id)}
                          aria-label={`Delete day ${d.day_order}`}
                          className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-danger hover:bg-danger-bg border border-border rounded-sm"
                        >
                          <Trash2 size={12} aria-hidden="true" />
                        </button>
                      </div>
                    ) : null}
                  </div>
                )}
              </li>
            )
          })}
        </ol>
      )}
      {addingDay ? (
        <div className="px-5 py-4 border-t border-border bg-paper">
          <DayEditForm
            day={null}
            onCancel={() => setAddingDay(false)}
            onSave={(p) => onAdd({ title: p.title ?? '', date: p.date ?? '', notes: p.notes ?? '' })}
            saving={saving}
          />
        </div>
      ) : isEditor ? (
        <div className="pt-3">
          <button
            type="button"
            onClick={() => setAddingDay(true)}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
          >
            <Plus size={14} aria-hidden="true" /> Add day
          </button>
        </div>
      ) : null}
    </fieldset>
  )
}

function DayEditForm({
  day,
  onCancel,
  onSave,
  saving,
}: {
  day: ItineraryDay | null
  onCancel: () => void
  onSave: (patch: Partial<ItineraryDay>) => Promise<void>
  saving: boolean
}) {
  const [title, setTitle] = useState(day?.title ?? '')
  const [date, setDate] = useState(day?.date ?? '')
  const [notes, setNotes] = useState(day?.notes ?? '')
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        await onSave({
          title: title.trim() || null,
          date: date || null,
          notes: notes.trim() || null,
        })
      }}
      className="space-y-2"
    >
      <div className="form-group">
        <label htmlFor={`day-title-${day?.id ?? 'new'}`} className="form-label">Title</label>
        <input id={`day-title-${day?.id ?? 'new'}`} type="text" maxLength={100} value={title} onChange={(e) => setTitle(e.target.value)} className="form-input" autoFocus />
      </div>
      <div className="form-group">
        <label htmlFor={`day-date-${day?.id ?? 'new'}`} className="form-label">Date</label>
        <input id={`day-date-${day?.id ?? 'new'}`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input" />
      </div>
      <div className="form-group">
        <label htmlFor={`day-notes-${day?.id ?? 'new'}`} className="form-label">Notes</label>
        <textarea id={`day-notes-${day?.id ?? 'new'}`} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-input form-textarea" />
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="submit" disabled={saving} className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} {day ? 'Save' : 'Add day'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper">
          <X size={13} aria-hidden="true" /> Cancel
        </button>
      </div>
    </form>
  )
}

// =====================================================================
// Stops tab
// =====================================================================
function StopsTab({
  days,
  stops,
  isEditor,
  onAdd,
  onUpdate,
  onDelete,
  editingStopId,
  setEditingStopId,
  addingStop,
  setAddingStop,
  saving,
}: {
  days: ItineraryDay[]
  stops: ItineraryStop[]
  isEditor: boolean
  onAdd: (dayId: string | null, input: StopFormFields) => Promise<void>
  onUpdate: (id: string, patch: Partial<ItineraryStop>) => Promise<void>
  onDelete: (id: string) => Promise<void>
  editingStopId: string | null
  setEditingStopId: (id: string | null) => void
  addingStop: string | null
  setAddingStop: (dayId: string | null) => void
  saving: boolean
}) {
  const unassigned = stops.filter((s) => !s.day_id)
  return (
    <div className="space-y-4">
      {days.length === 0 && unassigned.length === 0 && !addingStop ? (
        <fieldset className="border border-dashed border-border rounded-sm bg-paper p-6 text-center">
          <MapPin size={20} className="mx-auto text-muted mb-2" aria-hidden="true" />
          <p className="text-sm font-medium text-ink mb-1">No stops yet</p>
          <p className="text-xs text-muted mb-3">Add a day first, or add a stop without a day to start.</p>
          {isEditor ? (
            <button
              type="button"
              onClick={() => setAddingStop('unassigned')}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              <Plus size={14} aria-hidden="true" /> Add first stop
            </button>
          ) : null}
        </fieldset>
      ) : null}
      {days.map((d) => {
        const dayStops = stops.filter((s) => s.day_id === d.id)
        const tl = computeDayTimeline(dayStops)
        return (
          <fieldset key={d.id} className="border border-border rounded-sm bg-[#FFFFFF] p-5">
            <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
              <Calendar size={11} aria-hidden="true" /> {d.title || `Day ${d.day_order}`}
              {d.date ? <span className="ml-1 tabular-nums">{new Date(d.date).toLocaleDateString('en-US')}</span> : null}
            </legend>
            {tl.hasAnyTime || tl.totalDuration > 0 ? (
              <p className="text-xs text-muted inline-flex flex-wrap items-center gap-x-3 gap-y-1 -mt-1 mb-3" style={{ fontVariantNumeric: 'tabular-nums' }}>
                <span className="inline-flex items-center gap-1">
                  <Clock size={10} aria-hidden="true" />
                  {tl.earliestStart ?? '—'} → {tl.latestEnd ?? '—'}
                  {tl.span != null ? ` (${formatMinutes(tl.span)})` : ''}
                </span>
                {tl.totalDuration > 0 ? (
                  <span className="inline-flex items-center gap-1">
                    <Hourglass size={10} aria-hidden="true" />
                    {formatMinutes(tl.totalDuration)} on-site
                  </span>
                ) : null}
                <span>
                  {dayStops.length} stop{dayStops.length === 1 ? '' : 's'}
                </span>
              </p>
            ) : null}
            {dayStops.length === 0 && addingStop !== d.id ? (
              <p className="text-sm text-subtle italic py-2">No stops for this day.</p>
            ) : (
              <ol className="border-t border-border first:border-t-0 -mx-5">
                {dayStops.map((s, idx) => (
                  <li key={s.id} className="border-b border-border last:border-b-0">
                    {editingStopId === s.id ? (
                      <div className="px-5 py-4">
                        <StopEditForm
                          stop={s}
                          onCancel={() => setEditingStopId(null)}
                          onSave={onUpdate}
                          onDelete={onDelete}
                          saving={saving}
                        />
                      </div>
                    ) : (
                      <div className="flex items-start gap-3 px-5 py-3">
                        <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-primary text-paper text-[11px] font-semibold flex-shrink-0 tabular-nums" aria-hidden="true">
                          {idx + 1}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-ink">
                            {s.name}
                            {s.planned_time ? (
                              <span className="ml-2 text-xs text-muted tabular-nums">
                                <Clock size={10} className="inline-block mr-0.5" aria-hidden="true" />
                                {s.planned_time.slice(0, 5)}
                                {s.duration_minutes ? ` · ${formatMinutes(s.duration_minutes)}` : ''}
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-muted mt-0.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                            {s.category ? <span className="badge badge-info text-[10px] capitalize">{s.category}</span> : null}
                            {s.transport ? <span className="inline-flex items-center gap-1"><Car size={10} aria-hidden="true" /> {s.transport}</span> : null}
                            {s.est_cost_cents ? <span className="inline-flex items-center gap-1"><Banknote size={10} aria-hidden="true" /> {vnd(s.est_cost_cents)}</span> : null}
                            {s.opening_hours ? <span className="inline-flex items-center gap-1"><DoorOpen size={10} aria-hidden="true" /> {s.opening_hours}</span> : null}
                          </p>
                          {s.address ? <p className="text-xs text-muted mt-0.5 inline-flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {s.address}</p> : null}
                          {s.transport_note ? <p className="text-xs text-muted mt-0.5 italic">{s.transport_note}</p> : null}
                          {s.notes ? <p className="text-xs text-ink mt-1">{s.notes}</p> : null}
                        </div>
                        {isEditor ? (
                          <div className="flex flex-col gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={() => setEditingStopId(s.id)}
                              aria-label={`Edit stop ${idx + 1}`}
                              className="inline-flex items-center justify-center w-7 h-7 text-ink hover:bg-paper border border-border rounded-sm"
                            >
                              <Pencil size={12} aria-hidden="true" />
                            </button>
                          </div>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            )}
            {addingStop === d.id ? (
              <div className="px-5 py-4 border-t border-border bg-paper">
                <StopEditForm
                  stop={null}
                  onCancel={() => setAddingStop(null)}
                  onSave={onUpdate}
                  onCreate={(input) => onAdd(d.id, input)}
                  saving={saving}
                />
              </div>
            ) : isEditor ? (
              <div className="pt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setAddingStop(d.id)}
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                >
                  <Plus size={14} aria-hidden="true" /> Add stop
                </button>
                <button
                  type="button"
                  onClick={() => setAddingStop(d.id + '__blank')}
                  aria-label="Add blank stop"
                  className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                >
                  <Plus size={14} aria-hidden="true" /> + quick add
                </button>
              </div>
            ) : null}
          </fieldset>
        )
      })}
      {days.length > 0 ? (
        <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
          <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
            <MapPin size={11} aria-hidden="true" /> Unassigned
          </legend>
          {unassigned.length === 0 && addingStop !== 'unassigned' && !addingStop?.endsWith('__blank') ? (
            <p className="text-sm text-subtle italic py-2">No unassigned stops.</p>
          ) : (
            <ol className="border-t border-border first:border-t-0 -mx-5">
              {unassigned.map((s, idx) => (
                <li key={s.id} className="border-b border-border last:border-b-0">
                  {editingStopId === s.id ? (
                    <div className="px-5 py-4">
                      <StopEditForm stop={s} onCancel={() => setEditingStopId(null)} onSave={onUpdate} onDelete={onDelete} saving={saving} />
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 px-5 py-3">
                      <span className="inline-flex items-center justify-center w-7 h-7 rounded-sm bg-paper text-ink text-[11px] font-semibold flex-shrink-0 tabular-nums border border-border" aria-hidden="true">
                        {idx + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink">
                          {s.name}
                          {s.planned_time ? (
                            <span className="ml-2 text-xs text-muted tabular-nums">
                              <Clock size={10} className="inline-block mr-0.5" aria-hidden="true" />
                              {s.planned_time.slice(0, 5)}
                            </span>
                          ) : null}
                        </p>
                        <p className="text-xs text-muted mt-0.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                          {s.category ? <span className="badge badge-info text-[10px] capitalize">{s.category}</span> : null}
                          {s.transport ? <span className="inline-flex items-center gap-1"><Car size={10} aria-hidden="true" /> {s.transport}</span> : null}
                          {s.est_cost_cents ? <span className="inline-flex items-center gap-1"><Banknote size={10} aria-hidden="true" /> {vnd(s.est_cost_cents)}</span> : null}
                        </p>
                        {s.address ? <p className="text-xs text-muted mt-0.5 inline-flex items-center gap-1"><MapPin size={11} aria-hidden="true" /> {s.address}</p> : null}
                        {s.notes ? <p className="text-xs text-ink mt-1">{s.notes}</p> : null}
                      </div>
                      {isEditor ? (
                        <div className="flex flex-col gap-1 flex-shrink-0">
                          <button type="button" onClick={() => setEditingStopId(s.id)} aria-label="Edit stop" className="inline-flex items-center justify-center w-7 h-7 text-ink hover:bg-paper border border-border rounded-sm">
                            <Pencil size={12} aria-hidden="true" />
                          </button>
                        </div>
                      ) : null}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
          {addingStop === 'unassigned' || addingStop?.endsWith('__blank') ? (
            <div className="px-5 py-4 border-t border-border bg-paper">
              <StopEditForm
                stop={null}
                onCancel={() => setAddingStop(null)}
                onSave={onUpdate}
                onCreate={(input) => onAdd(null, input)}
                saving={saving}
              />
            </div>
          ) : isEditor ? (
            <div className="pt-3">
              <button
                type="button"
                onClick={() => setAddingStop('unassigned')}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <Plus size={14} aria-hidden="true" /> Add unassigned stop
              </button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </div>
  )
}

function formatMinutes(min: number): string {
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function vnd(cents: number): string {
  // 1 VND = 1 unit. The DB column is `est_cost_cents` so we divide by 100
  // to get the display value. Display in VND with thousand separators.
  const v = Math.round(cents / 100)
  return `${v.toLocaleString('en-US')}₫`
}

function StopEditForm({
  stop,
  onCancel,
  onSave,
  onCreate,
  onDelete,
  saving,
}: {
  stop: ItineraryStop | null
  onCancel: () => void
  onSave: (id: string, patch: Partial<ItineraryStop>) => Promise<void>
  onCreate?: (input: StopFormFields) => Promise<void>
  onDelete?: (id: string) => Promise<void>
  saving: boolean
}) {
  const [name, setName] = useState(stop?.name ?? '')
  const [address, setAddress] = useState(stop?.address ?? '')
  const [notes, setNotes] = useState(stop?.notes ?? '')
  const [plannedTime, setPlannedTime] = useState(stop?.planned_time?.slice(0, 5) ?? '')
  const [duration, setDuration] = useState<string>(stop?.duration_minutes != null ? String(stop.duration_minutes) : '')
  const [category, setCategory] = useState<StopFormFields['category']>((stop?.category as StopFormFields['category']) ?? '')
  const [transport, setTransport] = useState<StopFormFields['transport']>((stop?.transport as StopFormFields['transport']) ?? '')
  const [transportNote, setTransportNote] = useState(stop?.transport_note ?? '')
  const [openingHours, setOpeningHours] = useState(stop?.opening_hours ?? '')
  const [estCost, setEstCost] = useState<string>(stop?.est_cost_cents != null ? String(stop.est_cost_cents) : '')
  const [photoUrl, setPhotoUrl] = useState(stop?.photo_url ?? '')

  function collect(): StopFormFields {
    const dur = duration.trim() ? Number(duration) : null
    const cost = estCost.trim() ? Number(estCost) : null
    return {
      name: name.trim(),
      address: address.trim(),
      notes: notes.trim(),
      planned_time: plannedTime,
      duration_minutes: dur != null && !Number.isNaN(dur) ? dur : null,
      category,
      transport,
      transport_note: transportNote,
      opening_hours: openingHours,
      est_cost_cents: cost != null && !Number.isNaN(cost) ? cost : null,
      photo_url: photoUrl,
    }
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault()
        const payload = collect()
        if (!payload.name) return
        if (stop) {
          await onSave(stop.id, {
            name: payload.name,
            address: payload.address || null,
            notes: payload.notes || null,
            planned_time: payload.planned_time || null,
            duration_minutes: payload.duration_minutes,
            category: payload.category || null,
            transport: payload.transport || null,
            transport_note: payload.transport_note.trim() || null,
            opening_hours: payload.opening_hours.trim() || null,
            est_cost_cents: payload.est_cost_cents,
            photo_url: payload.photo_url.trim() || null,
          })
        } else if (onCreate) {
          await onCreate(payload)
        }
      }}
      className="space-y-3"
    >
      <div className="form-group">
        <label htmlFor={`stop-name-${stop?.id ?? 'new'}`} className="form-label">
          Name <span className="text-danger" aria-hidden="true">*</span>
        </label>
        <input id={`stop-name-${stop?.id ?? 'new'}`} type="text" required maxLength={200} value={name} onChange={(e) => setName(e.target.value)} className="form-input" autoFocus placeholder="e.g. Marble Mountains, Bún chả Cá" />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="form-group">
          <label htmlFor={`stop-category-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <Tag size={11} aria-hidden="true" /> Category
          </label>
          <select id={`stop-category-${stop?.id ?? 'new'}`} value={category} onChange={(e) => setCategory(e.target.value as StopFormFields['category'])} className="form-input">
            {STOP_CATEGORIES.map((c) => <option key={c.v} value={c.v}>{c.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={`stop-address-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <MapPin size={11} aria-hidden="true" /> Address
          </label>
          <input id={`stop-address-${stop?.id ?? 'new'}`} type="text" maxLength={300} value={address} onChange={(e) => setAddress(e.target.value)} className="form-input" placeholder="e.g. 81 Huyen Tran Cong Chua" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="form-group">
          <label htmlFor={`stop-time-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <Clock size={11} aria-hidden="true" /> Start time
          </label>
          <input id={`stop-time-${stop?.id ?? 'new'}`} type="time" value={plannedTime} onChange={(e) => setPlannedTime(e.target.value)} className="form-input" />
        </div>
        <div className="form-group">
          <label htmlFor={`stop-duration-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <Hourglass size={11} aria-hidden="true" /> Stay (min)
          </label>
          <input id={`stop-duration-${stop?.id ?? 'new'}`} type="number" min={0} max={1440} step={5} value={duration} onChange={(e) => setDuration(e.target.value)} className="form-input" placeholder="e.g. 90" />
        </div>
        <div className="form-group">
          <label htmlFor={`stop-cost-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <Banknote size={11} aria-hidden="true" /> Est cost (VND)
          </label>
          <input id={`stop-cost-${stop?.id ?? 'new'}`} type="number" min={0} step={1000} value={estCost} onChange={(e) => setEstCost(e.target.value)} className="form-input" placeholder="e.g. 100000" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="form-group">
          <label htmlFor={`stop-transport-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <Car size={11} aria-hidden="true" /> How you get there
          </label>
          <select id={`stop-transport-${stop?.id ?? 'new'}`} value={transport} onChange={(e) => setTransport(e.target.value as StopFormFields['transport'])} className="form-input">
            {TRANSPORT_OPTIONS.map((t) => <option key={t.v} value={t.v}>{t.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label htmlFor={`stop-hours-${stop?.id ?? 'new'}`} className="form-label inline-flex items-center gap-1">
            <DoorOpen size={11} aria-hidden="true" /> Opening hours
          </label>
          <input id={`stop-hours-${stop?.id ?? 'new'}`} type="text" maxLength={120} value={openingHours} onChange={(e) => setOpeningHours(e.target.value)} className="form-input" placeholder="e.g. Mon–Sun 06:00–18:00" />
        </div>
      </div>

      <div className="form-group">
        <label htmlFor={`stop-transport-note-${stop?.id ?? 'new'}`} className="form-label">Transport note</label>
        <input id={`stop-transport-note-${stop?.id ?? 'new'}`} type="text" maxLength={200} value={transportNote} onChange={(e) => setTransportNote(e.target.value)} className="form-input" placeholder="e.g. take bus 1 from Han Market, 15 min ride" />
      </div>

      <div className="form-group">
        <label htmlFor={`stop-photo-${stop?.id ?? 'new'}`} className="form-label">Photo URL (optional)</label>
        <input id={`stop-photo-${stop?.id ?? 'new'}`} type="url" maxLength={500} value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} className="form-input" placeholder="https://…" />
      </div>

      <div className="form-group">
        <label htmlFor={`stop-notes-${stop?.id ?? 'new'}`} className="form-label">Notes</label>
        <textarea id={`stop-notes-${stop?.id ?? 'new'}`} rows={2} maxLength={500} value={notes} onChange={(e) => setNotes(e.target.value)} className="form-input form-textarea" placeholder="Anything to remember — dress code, reservation, what to order…" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={saving || !name.trim()} className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50">
          {saving ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Check size={13} aria-hidden="true" />} {stop ? 'Save stop' : 'Add stop'}
        </button>
        <button type="button" onClick={onCancel} disabled={saving} className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper">
          <X size={13} aria-hidden="true" /> Cancel
        </button>
        {stop && onDelete ? (
          <button
            type="button"
            onClick={async () => {
              if (window.confirm('Remove this stop from the itinerary?')) {
                await onDelete(stop.id)
              }
            }}
            disabled={saving}
            className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-danger border border-border-strong hover:bg-danger-bg ml-auto"
          >
            <Trash2 size={13} aria-hidden="true" /> Remove stop
          </button>
        ) : null}
        <span className="text-[10px] text-subtle ml-auto">
          Estimated cost is in VND ÷ 100
        </span>
      </div>
    </form>
  )
}

// =====================================================================
// Collaborators tab
// =====================================================================
function CollaboratorsTab({
  owner,
  collaborators,
  isOwner,
  share,
  shareUrl,
  inviteEmail,
  setInviteEmail,
  onInvite,
  onRevoke,
  onEnsureShare,
  onToggleShare,
  saving,
}: {
  owner: Profile | null
  collaborators: ItineraryCollaborator[]
  isOwner: boolean
  share: ItineraryShare | null
  shareUrl: string
  inviteEmail: string
  setInviteEmail: (s: string) => void
  onInvite: (email: string, role: 'editor' | 'viewer') => Promise<void>
  onRevoke: (id: string) => Promise<void>
  onEnsureShare: () => Promise<void>
  onToggleShare: (enabled: boolean) => Promise<void>
  saving: boolean
}) {
  const [role, setRole] = useState<'editor' | 'viewer'>('editor')
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
        <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
          <Users size={11} aria-hidden="true" /> Team
        </legend>
        <ul className="space-y-2">
          <li className="flex items-center gap-3 py-2">
            <Avatar name={owner?.full_name ?? 'Owner'} size="sm" />
            <div className="min-w-0 flex-1">
              <p className="text-sm text-ink truncate">{owner?.full_name ?? 'Owner'}</p>
              <p className="text-xs text-muted">Owner</p>
            </div>
          </li>
          {collaborators.map((c) => (
            <li key={c.id} className="flex items-center gap-3 py-2 border-t border-border">
              <Avatar name={c.user?.full_name ?? 'Collaborator'} src={c.user?.avatar_url} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink truncate">{c.user?.full_name ?? c.user?.email ?? '—'}</p>
                <p className="text-xs text-muted capitalize">
                  {c.role} · <span className={`badge ${c.status === 'accepted' ? 'badge-success' : c.status === 'declined' ? 'badge-danger' : c.status === 'revoked' ? 'badge-warning' : 'badge-info'} text-[10px]`}>{c.status}</span>
                </p>
              </div>
              {isOwner && c.status === 'accepted' ? (
                <button
                  type="button"
                  onClick={() => onRevoke(c.id)}
                  aria-label="Revoke collaborator"
                  className="inline-flex items-center justify-center w-7 h-7 text-muted hover:text-danger hover:bg-danger-bg border border-border rounded-sm"
                >
                  <Trash2 size={12} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {isOwner ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              await onInvite(inviteEmail, role)
            }}
            className="mt-4 pt-4 border-t border-border space-y-2"
          >
            <p className="text-[10px] uppercase tracking-wide text-muted">Invite by email</p>
            <div className="flex flex-wrap gap-2">
              <input
                type="email"
                required
                placeholder="teammate@localit.dev"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="form-input flex-1 min-w-[200px]"
                aria-label="Collaborator email"
              />
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as 'editor' | 'viewer')}
                className="form-input w-32"
                aria-label="Role"
              >
                <option value="editor">Editor</option>
                <option value="viewer">Viewer</option>
              </select>
              <button
                type="submit"
                disabled={saving || !inviteEmail.trim()}
                className="inline-flex items-center gap-1 h-10 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                <UserPlus size={14} aria-hidden="true" /> Invite
              </button>
            </div>
            <p className="text-[10px] text-subtle">They will see an accept/decline banner on the itinerary page.</p>
          </form>
        ) : null}
      </fieldset>

      <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
        <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
          <Share2 size={11} aria-hidden="true" /> Share link
        </legend>
        {share ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={shareUrl}
                className="form-input flex-1 min-w-0"
                aria-label="Share URL"
                style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '12px' }}
              />
              <button
                type="button"
                onClick={() => {
                  if (typeof navigator !== 'undefined' && navigator.clipboard) {
                    void navigator.clipboard.writeText(shareUrl)
                  }
                }}
                aria-label="Copy share link"
                className="inline-flex items-center gap-1 h-10 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <Copy size={13} aria-hidden="true" /> Copy
              </button>
            </div>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={share.enabled}
                onChange={(e) => onToggleShare(e.target.checked)}
                disabled={saving || !isOwner}
              />
              Share link enabled (read-only public view)
            </label>
            <p className="text-xs text-subtle">Anyone with the link can view this itinerary. They cannot edit.</p>
          </div>
        ) : isOwner ? (
          <button
            type="button"
            onClick={onEnsureShare}
            disabled={saving}
            className="inline-flex items-center gap-1 h-10 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
          >
            <Link2 size={14} aria-hidden="true" /> Generate share link
          </button>
        ) : (
          <p className="text-sm text-muted">Owner has not shared this itinerary yet.</p>
        )}
      </fieldset>
    </div>
  )
}

// =====================================================================
// Settings tab (alias of overview editing — kept for fast access)
// =====================================================================
function SettingsTab({
  itin,
  isOwner,
  onSave,
  onDelete,
  editing,
  setEditing,
  saving,
}: {
  itin: Itinerary
  isOwner: boolean
  onSave: (patch: Partial<Itinerary>) => Promise<void>
  onDelete: () => Promise<void>
  editing: boolean
  setEditing: (b: boolean) => void
  saving: boolean
}) {
  if (!isOwner) {
    return (
      <p className="text-sm text-muted">Only the owner can change itinerary settings.</p>
    )
  }
  return (
    <fieldset className="border border-border rounded-sm bg-[#FFFFFF] p-5">
      <legend className="px-2 text-[11px] uppercase tracking-wide text-muted inline-flex items-center gap-1">
        <Edit3 size={11} aria-hidden="true" /> Settings
      </legend>
      {editing ? (
        <ItinEditForm
          itin={itin}
          onCancel={() => setEditing(false)}
          onSave={onSave}
          saving={saving}
        />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-muted">Edit the title, dates, status, or delete this itinerary.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <Pencil size={13} aria-hidden="true" /> Edit details
            </button>
            <button
              type="button"
              onClick={onDelete}
              disabled={saving}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-danger border border-border-strong hover:bg-danger-bg disabled:opacity-50"
            >
              <Trash2 size={13} aria-hidden="true" /> Delete itinerary
            </button>
          </div>
        </div>
      )}
    </fieldset>
  )
}
