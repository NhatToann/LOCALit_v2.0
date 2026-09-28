'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/utils/supabase/auth'
import { Avatar } from '@/components/ui/Avatar'
import { Loader2, Plus, Trash2, X, Mail, UserPlus, Users, ShieldAlert } from 'lucide-react'

type TravelerRow = {
  id: string
  full_name: string
  avatar_url: string | null
  nationality: string | null
  role: 'lead' | 'companion'
  status: 'invited' | 'accepted' | 'declined' | 'removed'
}
type BuddyRow = {
  id: string
  full_name: string
  avatar_url: string | null
  specialties: string[]
  role: 'lead' | 'co-buddy'
  status: 'invited' | 'accepted' | 'declined' | 'removed'
  hourly_rate?: number | null
}

interface Props {
  tripId: string
  myId: string
  canManage: boolean // lead traveler or lead buddy
  onChange?: () => void
}

/**
 * Manage Companions panel — shows the trip's traveler and buddy registries
 * and lets a lead invite or remove companions by email.
 *
 * Email-lookup is the simplest way to invite (no separate "search" UI).
 * The invite creates a row in trip_travelers/trip_buddies with status='invited'.
 * RLS limits updates on others' rows to themselves only, so invites start as
 * "invited" and the recipient accepts via /itinerary/[id].
 */
export default function ManageCompanions({ tripId, myId, canManage, onChange }: Props) {
  const [travelers, setTravelers] = useState<TravelerRow[]>([])
  const [coBuddies, setCoBuddies] = useState<BuddyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState<'traveler' | 'buddy' | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const supabase = createClient()
    const [{ data: tr }, { data: bd }] = await Promise.all([
      supabase
        .from('trip_travelers')
        .select(
          'role, status, profile:safe_profiles(id, full_name, avatar_url), tourist:tourists(nationality)',
        )
        .eq('trip_id', tripId)
        .order('role', { ascending: true }),
      supabase
        .from('trip_buddies')
        .select(
          'role, status, profile:safe_profiles(id, full_name, avatar_url), buddy:buddies(specialties, hourly_rate)',
        )
        .eq('trip_id', tripId)
        .order('role', { ascending: true }),
    ])
    setTravelers(
      ((tr as any[]) || []).map((r) => ({
        id: r.profile?.id ?? '',
        full_name: r.profile?.full_name ?? 'Traveler',
        avatar_url: r.profile?.avatar_url ?? null,
        nationality: r.tourist?.nationality ?? null,
        role: r.role,
        status: r.status,
      })),
    )
    setCoBuddies(
      ((bd as any[]) || []).map((r) => ({
        id: r.profile?.id ?? '',
        full_name: r.profile?.full_name ?? 'Buddy',
        avatar_url: r.profile?.avatar_url ?? null,
        specialties: r.buddy?.specialties ?? [],
        hourly_rate: r.buddy?.hourly_rate ?? null,
        role: r.role,
        status: r.status,
      })),
    )
    setLoading(false)
  }, [tripId])

  useEffect(() => {
    load()
  }, [load])

  function flash(msg: string) {
    setToast(msg)
    setTimeout(() => setToast(null), 3000)
  }

  async function inviteTravelerByEmail() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      // Look up the user by email
      const { data: prof, error: e1 } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .ilike('email', email.trim())
        .maybeSingle()
      if (e1) throw e1
      if (!prof) {
        setError(`No LOCALit account yet for "${email}". Ask them to register first.`)
        return
      }
      if (prof.role !== 'tourist') {
        setError('That email belongs to a buddy. Use the "Add co-buddy" tab instead.')
        return
      }
      const { error: e2 } = await supabase
        .from('trip_travelers')
        .insert({
          trip_id: tripId,
          tourist_id: prof.id,
          role: 'companion',
          status: 'invited',
          invited_by: myId,
        })
      if (e2) {
        if (e2.code === '23505') {
          setError('That traveler is already on the trip.')
        } else {
          throw e2
        }
        return
      }
      flash(`Invited ${prof.full_name ?? email} to this trip`)
      setEmail('')
      setShowForm(null)
      await load()
      onChange?.()
    } catch (e: any) {
      setError(e?.message ?? 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  async function inviteBuddyByEmail() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      const supabase = createClient()
      const { data: prof, error: e1 } = await supabase
        .from('profiles')
        .select('id, full_name, role')
        .ilike('email', email.trim())
        .maybeSingle()
      if (e1) throw e1
      if (!prof) {
        setError(`No LOCALit account yet for "${email}". Ask them to register first.`)
        return
      }
      if (prof.role !== 'buddy') {
        setError('That email belongs to a tourist. Use the "Add companion" tab instead.')
        return
      }
      const { error: e2 } = await supabase
        .from('trip_buddies')
        .insert({
          trip_id: tripId,
          buddy_id: prof.id,
          role: 'co-buddy',
          status: 'invited',
          invited_by: myId,
        })
      if (e2) {
        if (e2.code === '23505') {
          setError('That buddy is already assigned to this trip.')
        } else {
          throw e2
        }
        return
      }
      flash(`Invited ${prof.full_name ?? email} as co-buddy`)
      setEmail('')
      setShowForm(null)
      await load()
      onChange?.()
    } catch (e: any) {
      setError(e?.message ?? 'Invite failed')
    } finally {
      setBusy(false)
    }
  }

  async function removeMember(kind: 'traveler' | 'buddy', userId: string) {
    if (!confirm('Remove this person from the trip?')) return
    setBusy(true)
    try {
      const supabase = createClient()
      const table = kind === 'traveler' ? 'trip_travelers' : 'trip_buddies'
      const col = kind === 'traveler' ? 'tourist_id' : 'buddy_id'
      const { error } = await supabase
        .from(table)
        .update({ status: 'removed' })
        .eq('trip_id', tripId)
        .eq(col, userId)
      if (error) throw error
      flash('Removed from trip')
      await load()
      onChange?.()
    } catch (e: any) {
      setError(e?.message ?? 'Remove failed')
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted">
        <Loader2 size={14} className="animate-spin" aria-hidden="true" /> Loading group…
      </div>
    )
  }

  const hasInvitedTraveler = travelers.some((t) => t.status === 'invited')
  const hasInvitedBuddy = coBuddies.some((b) => b.status === 'invited')

  return (
    <div className="space-y-6">
      {toast ? (
        <div
          role="status"
          className="border border-success-border bg-success-bg text-success px-3 py-2 text-sm rounded-sm"
        >
          {toast}
        </div>
      ) : null}

      {/* Travelers */}
      <section aria-labelledby="grp-travelers">
        <header className="flex items-center justify-between mb-2">
          <h3 id="grp-travelers" className="text-base font-semibold flex items-center gap-2">
            <Users size={14} aria-hidden="true" /> Travelers ({travelers.length})
          </h3>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setShowForm(showForm === 'traveler' ? null : 'traveler')
                setError(null)
              }}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <UserPlus size={12} aria-hidden="true" />
              {showForm === 'traveler' ? 'Cancel' : 'Add companion'}
            </button>
          ) : null}
        </header>

        {showForm === 'traveler' && canManage ? (
          <div className="border border-border rounded-sm bg-paper p-3 mb-3">
            <label className="form-label flex items-center gap-1" htmlFor="invite-email-traveler">
              <Mail size={12} aria-hidden="true" /> Companion email
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="invite-email-traveler"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="friend@example.com"
                className="form-input flex-1 min-w-[200px]"
              />
              <button
                type="button"
                onClick={inviteTravelerByEmail}
                disabled={busy || !email.trim()}
                className="inline-flex items-center justify-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Send invite
              </button>
            </div>
            {error ? (
              <p className="text-xs text-danger mt-2">{error}</p>
            ) : (
              <p className="text-xs text-muted mt-2">
                The companion must have a LOCALit account. They will see this trip on their dashboard after accepting.
              </p>
            )}
          </div>
        ) : null}

        <ul className="divide-y divide-border border border-border rounded-sm bg-surface">
          {travelers.map((t) => (
            <li
              key={`t-${t.id}-${t.role}`}
              className="p-3 flex items-center gap-3"
            >
              <Avatar name={t.full_name} src={t.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {t.full_name}{' '}
                  {t.role === 'lead' ? (
                    <span className="badge badge-warning text-[10px] ml-1">Lead</span>
                  ) : (
                    <span className="badge badge-neutral text-[10px] ml-1">Companion</span>
                  )}
                  {t.status === 'invited' ? (
                    <span className="badge badge-info text-[10px] ml-1">Invited</span>
                  ) : null}
                  {t.status === 'declined' ? (
                    <span className="badge badge-danger text-[10px] ml-1">Declined</span>
                  ) : null}
                  {t.status === 'removed' ? (
                    <span className="badge badge-danger text-[10px] ml-1">Removed</span>
                  ) : null}
                </p>
                {t.nationality ? (
                  <p className="text-xs text-muted">{t.nationality}</p>
                ) : null}
              </div>
              {canManage && t.role !== 'lead' && t.status !== 'removed' ? (
                <button
                  type="button"
                  onClick={() => removeMember('traveler', t.id)}
                  disabled={busy}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-danger hover:bg-danger-bg disabled:opacity-50"
                  aria-label={`Remove ${t.full_name}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {hasInvitedTraveler ? (
          <p className="text-xs text-muted mt-2 inline-flex items-center gap-1">
            <ShieldAlert size={12} aria-hidden="true" /> Pending companions must accept before they appear on the itinerary.
          </p>
        ) : null}
      </section>

      {/* Buddies */}
      <section aria-labelledby="grp-buddies">
        <header className="flex items-center justify-between mb-2">
          <h3 id="grp-buddies" className="text-base font-semibold flex items-center gap-2">
            <Users size={14} aria-hidden="true" /> Guides ({coBuddies.length})
          </h3>
          {canManage ? (
            <button
              type="button"
              onClick={() => {
                setShowForm(showForm === 'buddy' ? null : 'buddy')
                setError(null)
              }}
              className="inline-flex items-center gap-1 h-8 px-3 text-xs font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
            >
              <UserPlus size={12} aria-hidden="true" />
              {showForm === 'buddy' ? 'Cancel' : 'Add co-buddy'}
            </button>
          ) : null}
        </header>

        {showForm === 'buddy' && canManage ? (
          <div className="border border-border rounded-sm bg-paper p-3 mb-3">
            <label className="form-label flex items-center gap-1" htmlFor="invite-email-buddy">
              <Mail size={12} aria-hidden="true" /> Co-buddy email
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                id="invite-email-buddy"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="specialist@example.com"
                className="form-input flex-1 min-w-[200px]"
              />
              <button
                type="button"
                onClick={inviteBuddyByEmail}
                disabled={busy || !email.trim()}
                className="inline-flex items-center justify-center gap-1 h-10 px-4 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Send invite
              </button>
            </div>
            {error ? (
              <p className="text-xs text-danger mt-2">{error}</p>
            ) : (
              <p className="text-xs text-muted mt-2">
                Co-buddies must be on LOCALit. They will see the trip on their dashboard after accepting.
              </p>
            )}
          </div>
        ) : null}

        <ul className="divide-y divide-border border border-border rounded-sm bg-surface">
          {coBuddies.map((b) => (
            <li
              key={`b-${b.id}-${b.role}`}
              className="p-3 flex items-center gap-3"
            >
              <Avatar name={b.full_name} src={b.avatar_url} size="sm" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {b.full_name}{' '}
                  {b.role === 'lead' ? (
                    <span className="badge badge-warning text-[10px] ml-1">Lead</span>
                  ) : (
                    <span className="badge badge-neutral text-[10px] ml-1">Co-buddy</span>
                  )}
                  {b.status === 'invited' ? (
                    <span className="badge badge-info text-[10px] ml-1">Invited</span>
                  ) : null}
                  {b.status === 'declined' ? (
                    <span className="badge badge-danger text-[10px] ml-1">Declined</span>
                  ) : null}
                  {b.status === 'removed' ? (
                    <span className="badge badge-danger text-[10px] ml-1">Removed</span>
                  ) : null}
                </p>
                <p className="text-xs text-muted truncate">
                  {b.specialties.slice(0, 3).join(' · ') || 'Local guide'}
                  {b.hourly_rate ? ` · $${b.hourly_rate}/hr` : ''}
                </p>
              </div>
              {canManage && b.role !== 'lead' && b.status !== 'removed' ? (
                <button
                  type="button"
                  onClick={() => removeMember('buddy', b.id)}
                  disabled={busy}
                  className="inline-flex items-center justify-center w-8 h-8 rounded-sm text-danger hover:bg-danger-bg disabled:opacity-50"
                  aria-label={`Remove ${b.full_name}`}
                >
                  <Trash2 size={14} aria-hidden="true" />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
        {hasInvitedBuddy ? (
          <p className="text-xs text-muted mt-2 inline-flex items-center gap-1">
            <ShieldAlert size={12} aria-hidden="true" /> Pending co-buddies must accept before they appear on the itinerary.
          </p>
        ) : null}
      </section>

      <button
        type="button"
        onClick={() => {
          setShowForm(null)
          setError(null)
          setEmail('')
        }}
        className="hidden"
        aria-hidden="true"
      >
        reset
      </button>
    </div>
  )
}
