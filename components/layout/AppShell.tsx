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
  const [role, setRole] = useState<'tourist' | 'buddy' | null>(null);
  const [name, setName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const supabase = createClient();
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single();
      if (cancelled) return;
      if (profile?.role === 'tourist' || profile?.role === 'buddy') {
        setRole(profile.role);
        setName(profile.full_name ?? undefined);
      }
    }
    load();
    const { data: sub } = createClient().auth.onAuthStateChange(() => load());
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  if (role) {
    return <Header userRole={role} userName={name} />;
  }
  return <Header />;
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
