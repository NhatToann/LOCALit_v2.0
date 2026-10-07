import { Suspense } from 'react'
import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import NotificationsPageClient from './NotificationsPageClient'

export const dynamic = 'force-dynamic'

export default async function NotificationsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login?next=/notifications')

  const { data: rows } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <Suspense fallback={<div className="container-page py-16 text-center"><div className="loading-spinner mx-auto" /></div>}>
      <NotificationsPageClient
        userId={user.id}
        initialRows={(rows ?? []) as any[]}
      />
    </Suspense>
  )
}