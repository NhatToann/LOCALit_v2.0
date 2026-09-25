'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/utils/supabase/auth'
import type { Connection } from '@/lib/types'

export default function BuddyRequestsPage() {
  const [requests, setRequests] = useState<Connection[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'pending' | 'accepted' | 'declined'>('all')
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
      return
    }

    if (status === 'accepted') {
      const conn = requests.find((r) => r.id === id)
      if (conn) {
        const { error: convErr } = await supabase
          .from('conversations')
          .insert({ tourist_id: conn.tourist_id, buddy_id: conn.buddy_id })
        if (convErr && convErr.code !== '23505') {
          console.error('Conversation create error', convErr)
        }
      }
    }

    setRequests(requests.map((r) => (r.id === id ? { ...r, status } : r)))
    setToast({
      type: 'success',
      msg: status === 'accepted' ? '✓ Request accepted. A conversation is ready.' : 'Request declined.',
    })
    setTimeout(() => setToast(null), 3500)
  }

  const filtered = filter === 'all' ? requests : requests.filter(r => r.status === filter)

  if (loading) {
    return <div className="container py-xl text-center"><div className="loading-spinner mx-auto" /></div>
  }

  return (
    <div className="container py-xl">
      {toast && (
        <div className={`alert ${toast.type === 'success' ? 'alert-success' : 'alert-error'} mb-md`}>
          <span>{toast.type === 'success' ? '✓' : '⚠️'}</span>
          <span>{toast.msg}</span>
        </div>
      )}
      <div className="flex-between mb-lg">
        <div>
          <h1 className="text-3xl font-bold">Connection Requests</h1>
          <p className="text-muted mt-sm">{requests.length} requests in total</p>
        </div>
        <Link href="/buddy/dashboard" className="text-primary">← Back</Link>
      </div>

      <div className="flex gap-sm mb-lg">
        {(['all', 'pending', 'accepted', 'declined'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`btn btn-sm ${filter === f ? 'btn-primary' : 'btn-outline'}`}
          >
            {f === 'all' ? 'All' : f === 'pending' ? '⏳ Pending' : f === 'accepted' ? '✓ Accepted' : '✕ Declined'}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <p>No requests in this section.</p>
        </div>
      ) : (
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-lg)' }}>
          {filtered.map(r => {
            const t = r.tourist as any
            return (
              <div key={r.id} className="card">
                <div className="card-body">
                  <div className="flex items-center gap-md mb-md">
                    <div className="avatar avatar-lg">{t?.profile?.full_name?.charAt(0) || '?'}</div>
                    <div>
                      <p className="font-semibold">{t?.profile?.full_name}</p>
                      <p className="text-sm text-muted">{t?.nationality} • {t?.destination || 'Da Nang'}</p>
                    </div>
                  </div>

                  {r.message && (
                    <p className="text-sm text-secondary mb-md" style={{ fontStyle: 'italic', padding: '12px', background: 'var(--bg-light)', borderRadius: 8 }}>
                      &ldquo;{r.message}&rdquo;
                    </p>
                  )}

                  <div className="flex flex-wrap gap-xs mb-md">
                    {t?.interests?.map((i: string) => <span key={i} className="tag">{i}</span>)}
                    {t?.languages?.map((l: string) => <span key={l} className="lang-chip">{l}</span>)}
                  </div>

                  <div className="text-xs text-muted mb-md">
                    Arrival: {t?.arrival_date ? new Date(t.arrival_date).toLocaleDateString('en-US') : 'Not specified'}
                  </div>

                  {r.status === 'pending' ? (
                    <div className="flex gap-sm">
                      <button onClick={() => updateStatus(r.id, 'accepted')} className="btn btn-primary flex-1">
                        ✓ Accept
                      </button>
                      <button onClick={() => updateStatus(r.id, 'declined')} className="btn btn-outline flex-1">
                        ✕ Decline
                      </button>
                    </div>
                  ) : (
                    <span className={`badge badge-${r.status === 'accepted' ? 'success' : 'danger'} w-full text-center`} style={{ display: 'block', padding: '8px' }}>
                      {r.status === 'accepted' ? '✓ Accepted' : r.status === 'declined' ? '✕ Declined' : r.status}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
