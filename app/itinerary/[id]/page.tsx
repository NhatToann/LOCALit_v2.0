'use client'

import { useEffect, useState, useCallback, useTransition } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Share2,
  Copy,
  Pencil,
  Trash2,
  X,
  Check,
  Users,
  Calendar,
  Compass,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type {
  Itinerary,
  ItineraryDay,
  ItineraryStop,
  ItineraryShare,
  Profile,
} from '@/lib/types'
import Board from '@/components/itinerary/Board'
import { useItineraryRealtime } from '@/hooks/useItineraryRealtime'
import { Avatar } from '@/components/ui/Avatar'

/**
 * Itinerary board page — the default view after clicking a trip.
 *
 * Loading rule (user requirement, 2026-10-09)
 * ────────────────────────────────────────────
 * The board must render as soon as the user lands here, not after a
 * blocking spinner. We do this by:
 *   1. Streaming the initial load (one `Promise.all` for the 4 critical
 *      tables: itinerary, days, stops, owner).
 *   2. Mounting the board the moment `itinerary` is non-null, even if
 *      collaborators / share haven't arrived yet — the board's columns
 *      can render with zero days and zero cards.
 *   3. Hydrating collaborators + share in a second, non-blocking
 *      pass after the first paint.
 */
export default function ItineraryDetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const id = params?.id ?? ''
  const [itin, setItin] = useState<Itinerary | null>(null)
  const [days, setDays] = useState<ItineraryDay[]>([])
  const [stops, setStops] = useState<ItineraryStop[]>([])
  const [owner, setOwner] = useState<Profile | null>(null)
  const [collaborators, setCollaborators] = useState<Array<{ id: string; user_id: string; role: string; status: string; full_name?: string; avatar_url?: string }>>([])
  const [share, setShare] = useState<ItineraryShare | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)
  const [, startTransition] = useTransition()
  const [editingMeta, setEditingMeta] = useState(false)
  const [metaTitle, setMetaTitle] = useState('')
  const [metaStart, setMetaStart] = useState('')
  const [metaEnd, setMetaEnd] = useState('')
  const [metaNotes, setMetaNotes] = useState('')
  const [metaSaving, setMetaSaving] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [currentUser, setCurrentUser] = useState<Profile | null>(null)

  // Critical-path load (must finish before board can render).
  const loadCritical = useCallback(async () => {
    if (!id) return
    setLoadError(null)
    const sb = createClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) {
      router.push(`/login?redirect=/itinerary/${id}`)
      return
    }
    setCurrentUser({ id: user.id } as Profile)

    const { data: itinRow, error: e1 } = await sb
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
      setLoadError('Trip not found, or you do not have access.')
      setLoading(false)
      return
    }

    setItin(itinRow)
    setMetaTitle(itinRow.title)
    setMetaStart(itinRow.start_date ?? '')
    setMetaEnd(itinRow.end_date ?? '')
    setMetaNotes(itinRow.notes ?? '')

    // Now fetch the rest in parallel — the board is already mountable.
    const [
      { data: daysRows },
      { data: stopsRows },
      { data: ownerRow },
    ] = await Promise.all([
      sb
        .from('itinerary_days')
        .select('*')
        .eq('itinerary_id', id)
        .order('day_order', { ascending: true }),
      sb
        .from('itinerary_stops')
        .select('*')
        .eq('itinerary_id', id)
        .order('stop_order', { ascending: true }),
      sb
        .from('safe_profiles')
        .select('*')
        .eq('id', itinRow.owner_id)
        .maybeSingle<Profile>(),
    ])

    setDays((daysRows as ItineraryDay[]) ?? [])
    setStops((stopsRows as ItineraryStop[]) ?? [])
    setOwner((ownerRow as Profile) ?? null)
    setLoading(false)

    // Non-critical second pass: collaborators + share.
    void Promise.all([
      sb
        .from('itinerary_collaborators')
        .select('id, user_id, role, status, user:safe_profiles!itinerary_collaborators_user_id_fkey(full_name, avatar_url)')
        .eq('itinerary_id', id),
      sb
        .from('itinerary_share')
        .select('*')
        .eq('itinerary_id', id)
        .maybeSingle<ItineraryShare>(),
    ]).then(([c, s]) => {
      const collabs = (c.data ?? []).map((row: any) => ({
        id: row.id,
        user_id: row.user_id,
        role: row.role,
        status: row.status,
        full_name: row.user?.full_name,
        avatar_url: row.user?.avatar_url,
      }))
      setCollaborators(collabs)
      setShare(s.data ?? null)
    })
  }, [id, router])

  useEffect(() => {
    void loadCritical()
  }, [loadCritical])

  // Realtime sync
  useItineraryRealtime(
    id,
    (row, ev) => {
      if (ev === 'DELETE') {
        setDays((prev) => prev.filter((d) => d.id !== row.id))
        // Cascade: stops whose day_id was this day also disappear.
        setStops((prev) => prev.filter((s) => s.day_id !== row.id))
      } else {
        setDays((prev) => {
          const i = prev.findIndex((d) => d.id === row.id)
          if (i === -1) return [...prev, row].sort((a, b) => a.day_order - b.day_order)
          const next = [...prev]
          next[i] = row
          return next
        })
      }
    },
    (row, ev) => {
      if (ev === 'DELETE') {
        setStops((prev) => prev.filter((s) => s.id !== row.id))
      } else {
        setStops((prev) => {
          const i = prev.findIndex((s) => s.id === row.id)
          if (i === -1) return [...prev, row].sort((a, b) => a.stop_order - b.stop_order)
          const next = [...prev]
          next[i] = row
          return next
        })
      }
    },
  )

  const isOwner = !!itin && currentUser?.id === itin.owner_id
  const acceptedCollabs = collaborators.filter((c) => c.status === 'accepted')
  const canEdit = isOwner || acceptedCollabs.some(
    (c) => c.user_id === currentUser?.id && (c.role === 'owner' || c.role === 'editor'),
  )

  // ---------- Mutations ----------
  async function addDay(input: { title: string; date: string; start_time: string; end_time: string }) {
    if (!itin) throw new Error('No itinerary')
    const sb = createClient()
    const order = days.length > 0 ? Math.max(...days.map((d) => d.day_order)) + 1 : 1
    const { data, error } = await sb
      .from('itinerary_days')
      .insert({
        itinerary_id: itin.id,
        day_order: order,
        title: input.title.trim() || null,
        date: input.date || null,
        start_time: input.start_time || null,
        end_time: input.end_time || null,
      })
      .select()
      .single()
    if (error || !data) {
      const msg = error?.message ?? 'Could not add list'
      setActionError(msg)
      throw new Error(msg)
    }
    setDays((prev) => [...prev, data as ItineraryDay])
    return data as ItineraryDay
  }

  async function updateDay(dayId: string, patch: Partial<ItineraryDay>) {
    const sb = createClient()
    const { error } = await sb.from('itinerary_days').update(patch).eq('id', dayId)
    if (error) {
      setActionError(error.message)
      throw new Error(error.message)
    }
    setDays((prev) => prev.map((d) => (d.id === dayId ? { ...d, ...patch } : d)))
  }

  async function deleteDay(dayId: string) {
    if (!itin) return
    const sb = createClient()
    const { error } = await sb.from('itinerary_days').delete().eq('id', dayId)
    if (error) {
      setActionError(error.message)
      throw new Error(error.message)
    }
    setDays((prev) => prev.filter((d) => d.id !== dayId))
    setStops((prev) => prev.filter((s) => s.day_id !== dayId))
  }

  async function addCard(dayId: string, name: string) {
    if (!itin) throw new Error('No itinerary')
    const sb = createClient()
    const peer = stops.filter((s) => s.day_id === dayId)
    const order = peer.length > 0 ? Math.max(...peer.map((s) => s.stop_order)) + 1 : 1
    const { data, error } = await sb
      .from('itinerary_stops')
      .insert({
        itinerary_id: itin.id,
        day_id: dayId,
        stop_order: order,
        name: name.trim(),
        added_by: currentUser?.id ?? null,
      })
      .select()
      .single()
    if (error || !data) {
      const msg = error?.message ?? 'Could not add card'
      setActionError(msg)
      throw new Error(msg)
    }
    setStops((prev) => [...prev, data as ItineraryStop])
  }

  async function updateCard(id: string, patch: Partial<ItineraryStop>) {
    const sb = createClient()
    const { error } = await sb.from('itinerary_stops').update(patch).eq('id', id)
    if (error) {
      setActionError(error.message)
      throw new Error(error.message)
    }
    setStops((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  async function deleteCard(id: string) {
    const sb = createClient()
    const { error } = await sb.from('itinerary_stops').delete().eq('id', id)
    if (error) {
      setActionError(error.message)
      throw new Error(error.message)
    }
    setStops((prev) => prev.filter((s) => s.id !== id))
  }

  async function saveMeta() {
    if (!itin || !metaTitle.trim()) return
    setMetaSaving(true)
    const sb = createClient()
    const { error } = await sb
      .from('itineraries')
      .update({
        title: metaTitle.trim(),
        start_date: metaStart || null,
        end_date: metaEnd || null,
        notes: metaNotes.trim() || null,
        last_editor_id: currentUser?.id ?? null,
      })
      .eq('id', itin.id)
    setMetaSaving(false)
    if (error) {
      setActionError(error.message)
      return
    }
    setItin({ ...itin, title: metaTitle.trim(), start_date: metaStart || null, end_date: metaEnd || null, notes: metaNotes.trim() || null })
    setEditingMeta(false)
  }

  async function deleteItinerary() {
    if (!itin) return
    if (!window.confirm(`Delete "${itin.title}" and all its lists + cards? This cannot be undone.`)) return
    const sb = createClient()
    const { error } = await sb.from('itineraries').delete().eq('id', itin.id)
    if (error) {
      setActionError(error.message)
      return
    }
    router.push('/itinerary')
  }

  async function ensureShareToken() {
    if (!itin) return
    const sb = createClient()
    const { data, error } = await sb
      .from('itinerary_share')
      .upsert(
        { itinerary_id: itin.id, enabled: true },
        { onConflict: 'itinerary_id' },
      )
      .select()
      .single()
    if (error) {
      setActionError(error.message)
      return
    }
    setShare(data as ItineraryShare)
  }

  async function toggleShare(enabled: boolean) {
    if (!share) return
    const sb = createClient()
    const { error } = await sb.from('itinerary_share').update({ enabled }).eq('itinerary_id', share.itinerary_id)
    if (error) {
      setActionError(error.message)
      return
    }
    setShare({ ...share, enabled })
  }

  // ---------- Render ----------

  if (loading) {
    return (
      <main className="container-page py-16 text-center" aria-busy="true">
        <Loader2 size={20} className="animate-spin mx-auto text-muted" />
        <p className="sr-only">Loading trip…</p>
      </main>
    )
  }

  if (loadError || !itin) {
    return (
      <main className="container-page py-16">
        <div className="border border-danger bg-danger-bg text-danger rounded-sm px-4 py-3 mb-4 flex items-center gap-2" role="alert">
          <AlertTriangle size={16} aria-hidden />
          <span>{loadError ?? 'Trip not found.'}</span>
        </div>
        <Link href="/itinerary" className="inline-flex items-center gap-1 text-sm text-primary hover:underline">
          <ArrowLeft size={14} aria-hidden /> Back to all trips
        </Link>
      </main>
    )
  }

  const shareUrl = share?.token ? `${typeof window !== 'undefined' ? window.location.origin : ''}/itinerary/share/${share.token}` : ''

  return (
    <main className="container-page py-6 lg:py-8 space-y-4">
      <nav className="flex items-center gap-2 text-xs text-muted" aria-label="Breadcrumb">
        <Link href="/itinerary" className="hover:text-ink inline-flex items-center gap-1">
          <ArrowLeft size={11} aria-hidden /> Trips
        </Link>
        <span aria-hidden>/</span>
        <span className="text-ink truncate max-w-[40ch]">{itin.title}</span>
      </nav>

      {/* Compact header */}
      <header className="pb-4 border-b border-border">
        {editingMeta ? (
          <div className="space-y-3 max-w-2xl">
            <input
              type="text"
              maxLength={200}
              value={metaTitle}
              onChange={(e) => setMetaTitle(e.target.value)}
              className="form-input text-lg font-semibold"
              placeholder="Trip title"
              autoFocus
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className="form-label inline-flex items-center gap-1"><Calendar size={11} aria-hidden /> Start</span>
                <input type="date" value={metaStart} onChange={(e) => setMetaStart(e.target.value)} className="form-input" />
              </label>
              <label className="block">
                <span className="form-label inline-flex items-center gap-1"><Calendar size={11} aria-hidden /> End</span>
                <input type="date" value={metaEnd} onChange={(e) => setMetaEnd(e.target.value)} min={metaStart} className="form-input" />
              </label>
            </div>
            <label className="block">
              <span className="form-label inline-flex items-center gap-1"><Compass size={11} aria-hidden /> Notes</span>
              <textarea
                rows={2}
                maxLength={1000}
                value={metaNotes}
                onChange={(e) => setMetaNotes(e.target.value)}
                className="form-input form-textarea"
                placeholder="Special requests, things to do, dietary needs…"
              />
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={saveMeta}
                disabled={metaSaving || !metaTitle.trim()}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {metaSaving ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <Check size={13} aria-hidden />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingMeta(false)
                  setMetaTitle(itin.title)
                  setMetaStart(itin.start_date ?? '')
                  setMetaEnd(itin.end_date ?? '')
                  setMetaNotes(itin.notes ?? '')
                }}
                disabled={metaSaving}
                className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
              >
                <X size={13} aria-hidden /> Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h1 className="text-page-title mb-1">{itin.title}</h1>
              <p className="text-sm text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-1">
                {itin.start_date ? (
                  <span className="inline-flex items-center gap-1 tabular-nums">
                    <Calendar size={12} aria-hidden />
                    {new Date(itin.start_date).toLocaleDateString('en-US')}
                    {itin.end_date ? ` – ${new Date(itin.end_date).toLocaleDateString('en-US')}` : ''}
                  </span>
                ) : null}
                {owner ? (
                  <span className="inline-flex items-center gap-1">
                    <Users size={12} aria-hidden /> {owner.full_name}
                  </span>
                ) : null}
                {itin.notes ? (
                  <span className="text-xs text-muted max-w-md truncate" title={itin.notes}>{itin.notes}</span>
                ) : null}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="badge badge-primary text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {stops.length} card{stops.length === 1 ? '' : 's'}
              </span>
              <span className="badge badge-info text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                {days.length} list{days.length === 1 ? '' : 's'}
              </span>
              {acceptedCollabs.length > 0 ? (
                <span className="badge badge-success text-xs" style={{ fontVariantNumeric: 'tabular-nums' }}>
                  {acceptedCollabs.length + 1} on team
                </span>
              ) : null}
              {canEdit ? (
                <>
                  <button
                    type="button"
                    onClick={() => setEditingMeta(true)}
                    className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                  >
                    <Pencil size={12} aria-hidden /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setShareOpen((v) => !v)}
                    className="inline-flex items-center gap-1 h-8 px-2 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                  >
                    <Share2 size={12} aria-hidden /> Share
                  </button>
                  {isOwner ? (
                    <button
                      type="button"
                      onClick={deleteItinerary}
                      aria-label="Delete trip"
                      className="inline-flex items-center justify-center w-8 h-8 text-danger hover:bg-danger-bg border border-border-strong rounded-sm"
                    >
                      <Trash2 size={12} aria-hidden />
                    </button>
                  ) : null}
                </>
              ) : null}
            </div>
          </div>
        )}
      </header>

      {actionError ? (
        <div className="border border-danger bg-danger-bg text-danger rounded-sm px-3 py-2 text-xs flex items-center gap-2" role="alert">
          <AlertTriangle size={12} aria-hidden />
          <span className="flex-1">{actionError}</span>
          <button type="button" onClick={() => setActionError(null)} aria-label="Dismiss" className="text-danger hover:opacity-80">
            <X size={12} aria-hidden />
          </button>
        </div>
      ) : null}

      {shareOpen && canEdit ? (
        <div className="border border-border rounded-sm bg-surface p-4 max-w-2xl">
          <h2 className="text-sm font-semibold mb-2 inline-flex items-center gap-1">
            <Share2 size={13} aria-hidden /> Share link
          </h2>
          {share ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  aria-label="Share URL"
                  className="form-input flex-1 min-w-0 text-xs"
                  style={{ fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (typeof navigator !== 'undefined' && navigator.clipboard) {
                      void navigator.clipboard.writeText(shareUrl)
                    }
                  }}
                  className="inline-flex items-center gap-1 h-10 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                >
                  <Copy size={13} aria-hidden /> Copy
                </button>
              </div>
              <label className="flex items-center gap-2 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={share.enabled}
                  onChange={(e) => toggleShare(e.target.checked)}
                />
                Anyone with the link can view (read-only)
              </label>
            </div>
          ) : (
            <button
              type="button"
              onClick={ensureShareToken}
              className="inline-flex items-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
            >
              Generate share link
            </button>
          )}
        </div>
      ) : null}

      {/* The board mounts immediately. Empty state is handled inside Board. */}
      <section aria-label="Trip board">
        <Board
          itineraryId={itin.id}
          days={days}
          stops={stops}
          canEdit={canEdit}
          onAddDay={addDay}
          onUpdateDay={updateDay}
          onDeleteDay={deleteDay}
          onAddCard={addCard}
          onUpdateCard={updateCard}
          onDeleteCard={deleteCard}
        />
      </section>

      {acceptedCollabs.length > 0 ? (
        <section aria-label="Team" className="pt-2 border-t border-border">
          <h2 className="text-[11px] uppercase tracking-wide text-muted mb-2 inline-flex items-center gap-1">
            <Users size={11} aria-hidden /> Team ({acceptedCollabs.length + 1})
          </h2>
          <ul className="flex flex-wrap items-center gap-2">
            {owner ? (
              <li className="inline-flex items-center gap-2 px-2 py-1 bg-paper border border-border rounded-sm">
                <Avatar name={owner.full_name} src={owner.avatar_url} size="sm" />
                <span className="text-xs">{owner.full_name}</span>
                <span className="text-[10px] text-muted">Owner</span>
              </li>
            ) : null}
            {acceptedCollabs.map((c) => (
              <li key={c.id} className="inline-flex items-center gap-2 px-2 py-1 bg-paper border border-border rounded-sm">
                <Avatar name={c.full_name ?? 'Collaborator'} src={c.avatar_url} size="sm" />
                <span className="text-xs">{c.full_name ?? c.user_id}</span>
                <span className="text-[10px] text-muted capitalize">{c.role}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  )
}
