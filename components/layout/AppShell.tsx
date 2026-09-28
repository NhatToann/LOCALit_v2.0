'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import DaNangBackdrop from './DaNangBackdrop';
import MiniChatWindow from '@/components/chat/MiniChatWindow';
import IncomingCallWatcher from '@/components/chat/IncomingCallWatcher';
import { useAuthUser } from '@/lib/auth/useAuthUser';

const ROLE_LAYOUTS = ['/tourist', '/buddy'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

function AuthAwareHeader() {
  const auth = useAuthUser()
  const role = auth?.role ?? null
  const name = auth?.fullName
  const userId = auth?.userId

  if (role) {
    return <Header userRole={role} userName={name} userId={userId} />
  }
  return <Header />
}

/**
 * Runs alongside MiniChatWindow so the user gets notified of an
 * incoming voice call no matter which page they're on.
 */
function GlobalIncomingCallWatcher() {
  const auth = useAuthUser()
  return <IncomingCallWatcher currentUserId={auth?.userId ?? null} />
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
        <GlobalIncomingCallWatcher />
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
      <GlobalIncomingCallWatcher />
    </>
  );
}
