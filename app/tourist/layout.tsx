import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/auth'
import type { Profile } from '@/lib/types'
import Header from '@/components/layout/Header'

export default async function TouristLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>()

  if (profile?.role !== 'tourist') {
    redirect('/buddy/dashboard')
  }

  return (
    <>
      <Header userRole="tourist" />
      <main className="page-wrapper">{children}</main>
    </>
  )
}
