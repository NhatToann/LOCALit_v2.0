import { createClient } from '@/utils/supabase/server'
import Link from 'next/link'
import { Users, ArrowLeft, Sparkles } from 'lucide-react'
import ConnectionCard, { type ConnectionRow } from '@/components/connection/ConnectionCard'

export const metadata = {
  title: 'Connections · LOCALit',
  description: 'Manage your active, pending, and past connections with locals and travelers.',
}

export const dynamic = 'force-dynamic'

export default async function ConnectionsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return (
      <div className="container-page py-8">
        <p className="text-sm text-muted">Please sign in to see your connections.</p>
      </div>
    )
  }

  const { data: rows } = await supabase
    .from('connections')
    .select(
      'id, requester_id, recipient_id, status, duration_days, accepted_at, expires_at, locked_at, renewed_at',
    )
    .or(`requester_id.eq.${user.id},recipient_id.eq.${user.id}`)
    .order('updated_at', { ascending: false })

  const partnerIds = Array.from(
    new Set(
      (rows ?? []).map((r) => (r.requester_id === user.id ? r.recipient_id : r.requester_id)),
    ),
  )
  const { data: partners } = partnerIds.length
    ? await supabase
        .from('safe_profiles')
        .select('id, full_name, avatar_url, role')
        .in('id', partnerIds)
    : { data: [] }
  const partnerById = new Map((partners ?? []).map((p) => [p.id, p]))

  // Bucket
  const now = Date.now()
  const enriched: ConnectionRow[] = (rows ?? []).map((r) => {
    const partnerId = r.requester_id === user.id ? r.recipient_id : r.requester_id
    const expiresAt = r.expires_at ? new Date(r.expires_at) : null
    const isLocked =
      r.status === 'accepted' &&
      (r.locked_at != null || (expiresAt !== null && expiresAt.getTime() < now))
    const daysRemaining =
      r.status === 'accepted' && expiresAt
        ? Math.max(-999, Math.ceil((expiresAt.getTime() - now) / 86_400_000))
        : null
    const partner = partnerById.get(partnerId) ?? null
    return {
      id: r.id,
      requester_id: r.requester_id,
      recipient_id: r.recipient_id,
      status: r.status as 'pending' | 'accepted' | 'declined',
      duration_days: r.duration_days ?? null,
      accepted_at: r.accepted_at,
      expires_at: r.expires_at,
      locked_at: r.locked_at,
      renewed_at: r.renewed_at,
      is_locked: isLocked,
      days_remaining: daysRemaining,
      partner_id: partnerId,
      partner: partner
        ? {
            id: partner.id,
            full_name: partner.full_name,
            avatar_url: partner.avatar_url,
            role: (partner as { role?: 'tourist' | 'buddy' | 'admin' }).role ?? 'tourist',
          }
        : null,
    }
  })

  const active = enriched.filter((r) => r.status === 'accepted' && !r.is_locked)
  const locked = enriched.filter((r) => r.status === 'accepted' && r.is_locked)
  const pendingIncoming = enriched.filter(
    (r) => r.status === 'pending' && r.recipient_id === user.id,
  )
  const pendingOutgoing = enriched.filter(
    (r) => r.status === 'pending' && r.requester_id === user.id,
  )

  return (
    <div className="container-page py-8 max-w-3xl">
      <header className="mb-6">
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink mb-3"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to dashboard
        </Link>
        <h1 className="text-page-title flex items-center gap-2">
          <Users size={20} aria-hidden="true" />
          Connections
        </h1>
        <p className="text-sm text-muted mt-1 max-w-prose">
          Everyone you have an open, pending, or expired connection with. Renew before
          the timer runs out to keep chatting and editing shared itineraries.
        </p>
      </header>

      {/* Pending incoming */}
      <Section
        title="Awaiting your reply"
        count={pendingIncoming.length}
        empty="No new connection requests right now."
        tone="info"
        icon="incoming"
      >
        {pendingIncoming.map((row) => (
          <ConnectionCard key={row.id} row={row} viewerId={user.id} />
        ))}
      </Section>

      {/* Pending outgoing */}
      <Section
        title="Sent requests"
        count={pendingOutgoing.length}
        empty="No outgoing requests."
        tone="warning"
        icon="outgoing"
      >
        {pendingOutgoing.map((row) => (
          <ConnectionCard key={row.id} row={row} viewerId={user.id} />
        ))}
      </Section>

      {/* Active */}
      <Section
        title="Active"
        count={active.length}
        empty="No active connections yet — visit a profile and tap Connect."
        tone="success"
        icon="active"
      >
        {active.map((row) => (
          <ConnectionCard key={row.id} row={row} viewerId={user.id} />
        ))}
      </Section>

      {/* Locked */}
      <Section
        title="Expired"
        count={locked.length}
        empty="No expired connections."
        tone="danger"
        icon="locked"
      >
        {locked.map((row) => (
          <ConnectionCard key={row.id} row={row} viewerId={user.id} />
        ))}
      </Section>

      <p className="text-xs text-muted mt-8 inline-flex items-center gap-1">
        <Sparkles size={11} aria-hidden="true" />
        Set your default connection length in{' '}
        <Link href="/profile" className="underline">
          your profile
        </Link>
        .
      </p>
    </div>
  )
}

function Section({
  title,
  count,
  empty,
  tone,
  icon,
  children,
}: {
  title: string
  count: number
  empty: string
  tone: 'info' | 'warning' | 'success' | 'danger'
  icon: 'incoming' | 'outgoing' | 'active' | 'locked'
  children: React.ReactNode
}) {
  const dot =
    tone === 'info'
      ? 'bg-info'
      : tone === 'warning'
        ? 'bg-warning'
        : tone === 'success'
          ? 'bg-success'
          : 'bg-danger'

  return (
    <section className="mb-6">
      <h2 className="text-section-title flex items-center gap-2 mb-3">
        <span className={`inline-block w-2 h-2 rounded-full ${dot}`} aria-hidden="true" />
        {title}
        <span className="text-xs text-muted font-normal">({count})</span>
      </h2>
      {count === 0 ? (
        <p className="text-sm text-muted border border-dashed border-border rounded-sm px-4 py-3">
          {empty}
        </p>
      ) : (
        <ul className="flex flex-col gap-3">{children}</ul>
      )}
    </section>
  )
}
