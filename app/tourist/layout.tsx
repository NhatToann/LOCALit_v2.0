import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/server'
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
    .select('full_name, role')
    .eq('id', user.id)
    .single()

  if (profile?.role !== 'tourist') {
    redirect('/buddy/dashboard')
  }

  return (
    <>
      <Header userRole="tourist" userName={profile?.full_name ?? undefined} />
      <main className="page-wrapper">{children}</main>
      {/* Footer is rendered by root layout */}
    </>
  )
}
