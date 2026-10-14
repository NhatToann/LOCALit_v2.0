import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsPageClient from './NotificationsPageClient'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/notifications')

  // 2026-10-14 fix: also fetch the true unread count so the page
  // header can display "N unread" even when the user has more than
  // 20 unread rows (the rows fetch is limit-capped for display).
  const [rowsRes, countRes] = await Promise.all([
    supabase
      .from('notifications')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(200),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('read_at', null),
  ])

  return (
    <Suspense fallback={<div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>}>
      <NotificationsPageClient
        userId={user.id}
        initialRows={(rowsRes.data ?? []) as any[]}
        initialUnread={countRes.count ?? 0}
      />
    </Suspense>
  )
}