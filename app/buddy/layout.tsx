import { redirect } from 'next/navigation'
import { createClient } from '@/utils/supabase/auth'
import Header from '@/components/layout/Header'

export default async function BuddyLayout({
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

  if (profile?.role !== 'buddy') {
    redirect('/tourist/dashboard')
  }

  return (
    <>
      <Header userRole="buddy" userName={profile?.full_name ?? undefined} />
      <main className="page-wrapper">{children}</main>
    </>
  )
}
