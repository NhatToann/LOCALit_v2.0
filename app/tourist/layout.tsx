import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { createClient } from '@/utils/supabase/server';
import Header from '@/components/layout/Header';

export default async function TouristLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // FIX (2026-09-28): stop bouncing signed-in users back to /login on
  // every internal navigation. The middleware already confirms the cookie
  // is valid; the layout's server-side getUser() call sometimes returns
  // null for one tick when the cookie was just written (Next 16 +
  // @supabase/ssr cookie async). Use getSession (cookie + JWT decode, no
  // network) first; only if no session AND no auth cookie at all do we
  // redirect to /login.
  const cookieStore = await cookies();
  const hasAuthCookie = cookieStore.getAll().some((c) =>
    c.name.startsWith('sb-') || c.name.includes('auth-token'),
  );
  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  let user = session?.user ?? null;
  if (!user && hasAuthCookie) {
    // Cookie is here but the in-memory session cache hasn't refreshed yet.
    // One last network-validated lookup before we bounce.
    const { data } = await supabase.auth.getUser();
    user = data.user;
  }

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, role')
    .eq('id', user.id)
    .single();

  if (profile?.role !== 'tourist') {
    redirect('/buddy/dashboard');
  }

  return (
    <>
      <Header userRole="tourist" userName={profile?.full_name ?? undefined} />
      <main id="main-content" className="min-h-[calc(100vh-4rem)] pt-16">
        {children}
      </main>
    </>
  );
}
