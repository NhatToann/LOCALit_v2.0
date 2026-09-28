'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { Check, X, AlertTriangle, Clock, Search, UserPlus, MapPin, Globe, Heart, Loader2 } from 'lucide-react'
import { createClient, getCurrentUser } from '@/utils/supabase/auth'
import type { Connection } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

type FilterValue = 'all' | 'pending' | 'accepted' | 'declined'

interface TouristMatch {
  id: string
  full_name: string
  avatar_url: string | null
  nationality: string | null
  destination: string | null
  arrival_date: string | null
  travel_style: string | null
  interests: string[]
  languages: string[]
  budget_range: string | null
  is_visible: boolean
  has_active_connection: boolean
}

const INTEREST_OPTIONS = [
  'Beach', 'Photography', 'Food', 'History', 'Nature', 'Nightlife',
  'Shopping', 'Culture', 'Adventure', 'Wellness', 'Sunset', 'Architecture',
  'Local Life', 'Water Sports',
]

const LANGUAGE_OPTIONS = [
  'English', 'Vietnamese', 'Japanese', 'Korean', 'French', 'Mandarin', 'Russian',
]

export default function BuddyRequestsPage() {
  const [requests, setRequests] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  // Matching & search state
  const [matches, setMatches] = useState<TouristMatch[]>([])
  const [matchesLoading, setMatchesLoading] = useState(true)
  const [matchQuery, setMatchQuery] = useState('')
  const [matchInterests, setMatchInterests] = useState<string[]>([])
  const [matchLanguages, setMatchLanguages] = useState<string[]>([])
  const [matchSending, setMatchSending] = useState<string | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        setMatchesLoading(false)
        return
      }

      const [{ data }, { data: touristsData }, { data: existingConns }] = await Promise.all([
        supabase
          .from('connections')
          .select('*, tourist:tourists(*, profile:safe_profiles(full_name, avatar_url, is_online))')
          .eq('buddy_id', user.id)
          .order('created_at', { ascending: false }),
        supabase
          .from('tourists')
          .select(
            'id, nationality, travel_style, interests, languages, budget_range, arrival_date, destination, is_visible, profile:safe_profiles(full_name, avatar_url)',
          )
          .eq('is_visible', true)
          .neq('id', user.id)
          .order('updated_at', { ascending: false })
          .limit(60),
        supabase
          .from('connections')
          .select('tourist_id, status')
          .eq('buddy_id', user.id),
      ])

      setRequests((data as Connection[]) || [])

      const connByTourist = new Map<string, boolean>()
      for (const c of existingConns || []) {
        if (c.status === 'pending' || c.status === 'accepted') {
          connByTourist.set(c.tourist_id, true)
        }
      }

      const mapped: TouristMatch[] = ((touristsData as any[]) || []).map((t) => ({
        id: t.id,
        full_name: t.profile?.full_name ?? 'Traveler',
        avatar_url: t.profile?.avatar_url ?? null,
        nationality: t.nationality,
        destination: t.destination,
        arrival_date: t.arrival_date,
        travel_style: t.travel_style,
        interests: t.interests ?? [],
        languages: t.languages ?? [],
        budget_range: t.budget_range,
        is_visible: t.is_visible,
        has_active_connection: connByTourist.has(t.id),
      }))
      setMatches(mapped)
      setLoading(false)
      setMatchesLoading(false)
    }
    load()
  }, [])

  async function updateStatus(id: string, status: 'accepted' | 'declined') {
    const supabase = createClient()
    const { error: updateErr } = await supabase
      .from('connections')
      .update({ status })
      .eq('id', id)

    if (updateErr) {
      setToast({ type: 'error', msg: 'Could not update: ' + updateErr.message })
      setTimeout(() => setToast(null), 3500)
      return
    }

    if (status === 'accepted') {
      const conn = requests.find((r) => r.id === id)
      if (conn) {
        const { error: convErr } = await supabase
          .from('conversations')
          .insert({ tourist_id: conn.tourist_id, buddy_id: conn.buddy_id })
        if (convErr && convErr.code !== '23505') {
          // Conversation may already exist; not fatal.
        }
      }
    }

    setRequests(requests.map((r) => (r.id === id ? { ...r, status } : r)))
    setToast({
      type: 'success',
      msg: status === 'accepted' ? 'Request accepted. Conversation is ready.' : 'Request declined.',
    })
    setTimeout(() => setToast(null), 3500)
  }

  async function sendRequestToTourist(touristId: string) {
    const me = await getCurrentUser()
    if (!me) return
    setMatchSending(touristId)
    const supabase = createClient()
    const { error: insertErr } = await supabase.from('connections').insert({
      tourist_id: touristId,
      buddy_id: me.id,
      status: 'pending',
      message: null,
    })
    setMatchSending(null)
    if (insertErr) {
      if (insertErr.code === '23505') {
        setToast({ type: 'error', msg: 'You already have an open request with this traveler.' })
      } else {
        setToast({ type: 'error', msg: 'Could not send request: ' + insertErr.message })
      }
      setTimeout(() => setToast(null), 3500)
      return
    }
    setMatches((prev) =>
      prev.map((t) => (t.id === touristId ? { ...t, has_active_connection: true } : t)),
    )
    setToast({ type: 'success', msg: 'Request sent. The traveler will see it in their inbox.' })
    setTimeout(() => setToast(null), 3500)
  }

  const filteredMatches = useMemo(() => {
    const q = matchQuery.trim().toLowerCase()
    return matches.filter((m) => {
      if (q) {
        const hay = [
          m.full_name,
          m.nationality ?? '',
          m.destination ?? '',
          m.travel_style ?? '',
          ...m.interests,
          ...m.languages,
        ]
          .join(' ')
          .toLowerCase()
        if (!hay.includes(q)) return false
      }
      if (matchInterests.length > 0) {
        const has = matchInterests.some((i) => m.interests.includes(i))
        if (!has) return false
      }
      if (matchLanguages.length > 0) {
        const has = matchLanguages.some((l) => m.languages.includes(l))
        if (!has) return false
      }
      return true
    })
  }, [matches, matchQuery, matchInterests, matchLanguages])

  function toggleArrayValue<T>(arr: T[], v: T): T[] {
    return arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]
  }

  const filtered = filter === 'all' ? requests : requests.filter((r) => r.status === filter)

  // Sort pending first (urgency), then by created_at desc
  const sorted = [...filtered].sort((a, b) => {
    if (a.status === 'pending' && b.status !== 'pending') return -1
    if (b.status === 'pending' && a.status !== 'pending') return 1
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  if (loading) {
    return (
      <div className="container-page py-16 text-center">
        <div className="loading-spinner mx-auto" />
      </div>
    )
  }

  const pendingCount = requests.filter((r) => r.status === 'pending').length

  return (
    <div className="container-page py-8">
      {toast ? (
        <div
          className={`alert ${toast.type === 'success' ? 'alert-success' : 'alert-error'} mb-4`}
          role="status"
        >
          {toast.type === 'success' ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <AlertTriangle size={16} aria-hidden="true" />
          )}
          <span>{toast.msg}</span>
        </div>
      ) : null}

      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-eyebrow text-primary mb-2">Buddy inbox</p>
          <h1 className="text-page-title">Connection requests</h1>
          <p className="text-sm text-muted mt-1">
            {requests.length} {requests.length === 1 ? 'request' : 'requests'} in total ·{' '}
            <span className={pendingCount > 0 ? 'text-warning font-medium' : 'text-muted'}>
              {pendingCount} pending
            </span>
          </p>
        </div>
        <Link
          href="/buddy/dashboard"
          className="text-sm text-muted hover:text-ink"
        >
          Back to dashboard
        </Link>
      </header>

      {/* ============================================================
          INCOMING CONNECTION REQUESTS — pending first, then the rest
          ============================================================ */}
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4" role="tablist">
        {(['all', 'pending', 'accepted', 'declined'] as const).map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              role="tab"
              aria-selected={active}
              onClick={() => setFilter(f)}
              className={`h-8 px-3 text-sm font-medium rounded-pill border transition-colors duration-150 capitalize ${
                active
                  ? 'bg-primary text-paper border-primary'
                  : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
              }`}
            >
              {f}
            </button>
          )
        })}
      </div>

      {/* Request list (flat, not card soup) */}
      {sorted.length === 0 ? (
        <div className="border border-border rounded-sm p-12 bg-surface text-center">
          <p className="text-base text-muted">
            No requests in this section. New connection requests will appear here.
          </p>
        </div>
      ) : (
        <section
          aria-labelledby="requests-title"
          className="border border-border rounded-sm bg-surface mb-8"
        >
          <header className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 id="requests-title" className="text-lg font-semibold">
                Connection requests
              </h2>
              <p className="text-sm text-muted mt-1">
                Stage 1 — tourists searching for a buddy. Pending requests show first.
              </p>
            </div>
            <span className="badge badge-primary">{sorted.length}</span>
          </header>
          <ul className="divide-y divide-border">
            {sorted.map((r) => {
              const t = r.tourist as any
              const isPending = r.status === 'pending'
              const ageHours = Math.floor(
                (Date.now() - new Date(r.created_at).getTime()) / (1000 * 60 * 60),
              )
              const isUrgent = isPending && ageHours >= 24
              return (
                <li key={r.id} className="p-4">
                  <div className="flex flex-wrap items-start gap-4">
                    <Avatar name={t?.profile?.full_name ?? 'Traveler'} size="lg" />
                    <div className="flex-1 min-w-[240px]">
                      <div className="flex flex-wrap items-center gap-2 mb-1">
                        <p className="text-base font-semibold text-ink">
                          {t?.profile?.full_name ?? 'Traveler'}
                        </p>
                        <span className="badge badge-neutral text-xs">
                          {t?.nationality || '—'} · {t?.destination || 'Da Nang'}
                        </span>
                        {isUrgent ? (
                          <span className="badge badge-warning text-xs">
                            <Clock size={12} className="mr-1" aria-hidden="true" />
                            Waiting {ageHours}h
                          </span>
                        ) : null}
                      </div>
                      {r.message ? (
                        <blockquote className="text-sm text-ink leading-relaxed mt-2 px-3 py-2 border-l-2 border-border-strong max-w-prose">
                          &ldquo;{r.message}&rdquo;
                        </blockquote>
                      ) : null}
                      <div className="flex flex-wrap gap-1 mt-2">
                        {t?.interests?.slice(0, 3).map((i: string) => (
                          <span key={i} className="badge badge-neutral text-xs">
                            {i}
                          </span>
                        ))}
                        {t?.languages?.slice(0, 3).map((l: string) => (
                          <span key={l} className="lang-chip">{l}</span>
                        ))}
                      </div>
                      <p className="text-xs text-muted mt-2">
                        Arrival:{' '}
                        {t?.arrival_date
                          ? new Date(t.arrival_date).toLocaleDateString('en-US')
                          : 'Not specified'}
                      </p>
                    </div>

                    <div className="flex flex-col gap-2 min-w-[140px]">
                      {r.status === 'pending' ? (
                        <>
                          <button
                            onClick={() => updateStatus(r.id, 'accepted')}
                            className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover"
                          >
                            <Check size={14} aria-hidden="true" />
                            Accept
                          </button>
                          <button
                            onClick={() => updateStatus(r.id, 'declined')}
                            className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-transparent text-ink border border-border-strong hover:bg-paper"
                          >
                            <X size={14} aria-hidden="true" />
                            Decline
                          </button>
                        </>
                      ) : (
                        <span
                          className={`badge ${
                            r.status === 'accepted' ? 'badge-success' : 'badge-danger'
                          } justify-center w-full`}
                        >
                          {r.status}
                        </span>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* ============================================================
          TOURIST MATCHING & SEARCH — buddies discover travelers
          (Below the inbox so the inbox keeps priority for the buddy's daily flow.)
          ============================================================ */}
      <section
        aria-labelledby="matches-title"
        className="border border-border rounded-sm bg-surface mb-8"
      >
        <header className="px-6 py-4 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="matches-title" className="text-lg font-semibold">
              Discover travelers matching your specialties
            </h2>
            <p className="text-sm text-muted mt-1">
              Search Da Nang-bound travelers by interests, language, or nationality. Send the first
              connection request to break the ice.
            </p>
          </div>
          <span className="badge badge-primary">{filteredMatches.length}</span>
        </header>

        <div className="p-6 space-y-4">
          <div className="relative">
            <Search
              size={16}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-subtle pointer-events-none"
              aria-hidden="true"
            />
            <input
              className="form-input w-full pl-9"
              placeholder="Search by name, nationality, interests, or language"
              value={matchQuery}
              onChange={(e) => setMatchQuery(e.target.value)}
              aria-label="Search travelers"
            />
          </div>

          <fieldset>
            <legend className="form-label flex items-center gap-1">
              <Heart size={14} aria-hidden="true" /> Interests
            </legend>
            <div className="flex flex-wrap gap-2">
              {INTEREST_OPTIONS.map((i) => {
                const active = matchInterests.includes(i)
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setMatchInterests((prev) => toggleArrayValue(prev, i))}
                    className={`h-8 px-3 text-xs font-medium rounded-pill border transition-colors duration-150 ${
                      active
                        ? 'bg-primary text-paper border-primary'
                        : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
                    }`}
                  >
                    {i}
                  </button>
                )
              })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="form-label flex items-center gap-1">
              <Globe size={14} aria-hidden="true" /> Languages
            </legend>
            <div className="flex flex-wrap gap-2">
              {LANGUAGE_OPTIONS.map((l) => {
                const active = matchLanguages.includes(l)
                return (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setMatchLanguages((prev) => toggleArrayValue(prev, l))}
                    className={`h-8 px-3 text-xs font-medium rounded-pill border transition-colors duration-150 ${
                      active
                        ? 'bg-primary text-paper border-primary'
                        : 'bg-transparent text-muted border-border hover:text-ink hover:border-border-strong'
                    }`}
                  >
                    {l}
                  </button>
                )
              })}
            </div>
          </fieldset>

          {(matchQuery || matchInterests.length > 0 || matchLanguages.length > 0) ? (
            <button
              type="button"
              onClick={() => {
                setMatchQuery('')
                setMatchInterests([])
                setMatchLanguages([])
              }}
              className="text-xs text-muted hover:text-ink"
            >
              Clear filters
            </button>
          ) : null}
        </div>

        {matchesLoading ? (
          <div className="px-6 pb-6 flex items-center gap-2 text-sm text-muted">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            Loading travelers…
          </div>
        ) : filteredMatches.length === 0 ? (
          <div className="px-6 pb-6 text-sm text-muted">
            No travelers match these filters. Try clearing one of them.
          </div>
        ) : (
          <ul className="divide-y divide-border border-t border-border">
            {filteredMatches.slice(0, 20).map((m) => (
              <li key={m.id} className="p-4 flex flex-wrap items-start gap-4">
                <Avatar name={m.full_name} src={m.avatar_url} size="lg" />
                <div className="flex-1 min-w-[240px]">
                  <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="text-base font-semibold text-ink">{m.full_name}</p>
                    <span className="badge badge-neutral text-xs">
                      {m.nationality || '—'}
                      {m.travel_style ? ` · ${m.travel_style}` : ''}
                    </span>
                  </div>
                  <p className="text-xs text-muted flex flex-wrap items-center gap-x-3 gap-y-1">
                    {m.destination ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin size={11} aria-hidden="true" />
                        {m.destination}
                      </span>
                    ) : null}
                    <span>
                      Arrival:{' '}
                      {m.arrival_date
                        ? new Date(m.arrival_date).toLocaleDateString('en-US')
                        : 'Not specified'}
                    </span>
                    {m.budget_range ? <span>Budget: {m.budget_range}</span> : null}
                  </p>
                  <div className="flex flex-wrap gap-1 mt-2">
                    {m.interests.slice(0, 4).map((i) => (
                      <span key={i} className="badge badge-neutral text-xs">
                        {i}
                      </span>
                    ))}
                    {m.languages.slice(0, 3).map((l) => (
                      <span key={l} className="lang-chip">
                        {l}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="min-w-[140px] flex flex-col gap-2">
                  {m.has_active_connection ? (
                    <span className="badge badge-success justify-center w-full">
                      Connected
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => sendRequestToTourist(m.id)}
                      disabled={matchSending === m.id}
                      className="inline-flex items-center justify-center gap-1 h-9 px-3 text-sm font-medium rounded-sm bg-primary text-paper border border-primary hover:bg-primary-hover disabled:opacity-50"
                    >
                      {matchSending === m.id ? (
                        <Loader2 size={14} className="animate-spin" aria-hidden="true" />
                      ) : (
                        <UserPlus size={14} aria-hidden="true" />
                      )}
                      Send request
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
