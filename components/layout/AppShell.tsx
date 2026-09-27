'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import DaNangBackdrop from './DaNangBackdrop';
import MiniChatWindow from '@/components/chat/MiniChatWindow';
import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/auth';

const ROLE_LAYOUTS = ['/tourist', '/buddy'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/reset-password', '/verify-email'];

function AuthAwareHeader() {
  const [role, setRole] = useState<'tourist' | 'buddy' | null>(null)
  const [name, setName] = useState<string | undefined>(undefined)
  const [userId, setUserId] = useState<string | undefined>(undefined)
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const supabase = createClient()
        const { data: { user } } = await supabase.auth.getUser()
        if (cancelled) return
        if (!user) {
          setRole(null)
          setName(undefined)
          setUserId(undefined)
          return
        }
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, role')
          .eq('id', user.id)
          .single()
        if (cancelled) return
        if (profile?.role === 'tourist' || profile?.role === 'buddy') {
          setRole(profile.role)
          setName(profile.full_name ?? undefined)
          setUserId(user.id)
        }
      } catch {
        // Swallow — the timeout fallback below will retry
      }
    }
    load()
    // Re-run on Supabase session change events
    const sub = createClient().auth.onAuthStateChange(() => load())
    // Re-run when a sibling component manually signals that auth changed
    // (e.g. after signIn() — see utils/supabase/auth.ts).
    const onLocalChange = () => load()
    window.addEventListener('localit-auth-changed', onLocalChange)
    return () => {
      cancelled = true
      sub.data.subscription.unsubscribe()
      window.removeEventListener('localit-auth-changed', onLocalChange)
    }
  }, [])

  // Fallback: if the header is still in guest state after 3 s (e.g. opened
  // directly in a new tab where onAuthStateChange doesn't fire), retry once.
  useEffect(() => {
    if (role) return
    const id = setTimeout(() => setAttempt((n) => n + 1), 3000)
    return () => clearTimeout(id)
  }, [role])

  useEffect(() => {
    if (role || attempt === 0) return
    let cancelled = false
    async function retry() {
      const supabase = createClient()
      const { data: { user } } = await supabase.auth.getUser()
      if (cancelled || !user) return
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()
      if (cancelled) return
      if (profile?.role === 'tourist' || profile?.role === 'buddy') {
        setRole(profile.role)
        setName(profile.full_name ?? undefined)
        setUserId(user.id)
      }
    }
    retry()
    return () => {
      cancelled = true
    }
  }, [attempt, role])

  if (role) {
    return <Header userRole={role} userName={name} userId={userId} />
  }
  return <Header />
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inRoleLayout = ROLE_LAYOUTS.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.includes(pathname);

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (inRoleLayout) {
    return (
      <>
        <DaNangBackdrop />
        {children}
        <Footer />
        <MiniChatWindow />
      </>
    );
  }

  return (
    <>
      <DaNangBackdrop />
      <AuthAwareHeader />
      <main
        id="main-content"
        className="min-h-[calc(100vh-4rem)] pt-16"
      >
        {children}
      </main>
      <Footer />
      <MiniChatWindow />
    </>
  );
}
