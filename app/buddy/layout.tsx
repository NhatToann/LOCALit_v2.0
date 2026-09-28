import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import Header from '@/components/layout/Header';

export default async function BuddyLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // FIX (2026-09-28): stop bouncing signed-in users back to /login on
  // every internal navigation. See the matching comment in
  // app/tourist/layout.tsx for the full reasoning.
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll().some((c) =>
    c.name.startsWith('sb-') || c.name.includes('auth-token'),
  );
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  if (!user && hasAuthCookie) {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'buddy') {
    redirect('/tourist/dashboard');
  }

  return (
    <>
      <Header userRole="buddy" userName={profile?.full_name ?? undefined} />
      <main id="main-content" className="min-h-[calc(100vh-4rem)] pt-16">
        {children}
      </main>
    </>
  );
}
