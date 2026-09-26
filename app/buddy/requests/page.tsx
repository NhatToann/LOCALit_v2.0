'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Check, X, AlertTriangle, Clock } from 'lucide-react'
import { createClient } from '@/utils/supabase/auth'
import type { Connection } from '@/lib/types'
import { Avatar } from '@/components/ui/Avatar'

type FilterValue = 'all' | 'pending' | 'accepted' | 'declined'

export default function BuddyRequestsPage() {
  const [requests, setRequests] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<FilterValue>('all')
  const [toast, setToast] = useState<{ type: 'success' | 'error'; msg: string } | null>(null)

  useEffect(() => {
    async function load() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data } = await supabase
        .from('connections')
        .select('*, tourist:tourists(*, profile:profiles(*))')
        .eq('buddy_id', user.id)
        .order('created_at', { ascending: false })

      setRequests((data as Connection[]) || [])
      setLoading(false)
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

      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-6" role="tablist">
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
        <ul className="divide-y divide-border border border-border rounded-sm bg-surface">
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
      )}
    </div>
  )
}
