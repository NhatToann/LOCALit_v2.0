'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import DaNangBackdrop from './DaNangBackdrop';
import MiniChatWindow from '@/components/chat/MiniChatWindow';
import IncomingCallWatcher from '@/components/chat/IncomingCallWatcher';
import ActiveCallSheet from '@/components/layout/ActiveCallSheet';
import { useAuthUser } from '@/lib/auth/useAuthUser';
import { useOnlineHeartbeat } from '@/lib/realtime/useOnlineHeartbeat';
import { GlobalPresence } from '@/lib/realtime/useGlobalPresence';

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

/**
 * Mounts the online-heartbeat RPC. The hook itself owns the
 * setInterval / visibility / beforeunload listeners. Mounting at the
 * AppShell level means any authenticated page drives the heartbeat,
 * not just /chat.
 */
function GlobalOnlineHeartbeat() {
  const auth = useAuthUser()
  useOnlineHeartbeat(auth?.userId ?? null)
  return null
}

/**
 * Mounts the global Realtime presence broadcast channel. While
 * mounted it publishes `is_online=true` every 25 s and stores the
 * snapshots in a module-level cache that any component can read via
 * `usePresenceOf(userId)` / `useIsOnline(userId)`. This is the
 * sub-second layer on top of the 30-s DB heartbeat.
 */
function GlobalPresenceMount() {
  const auth = useAuthUser()
  return <GlobalPresence userId={auth?.userId ?? null} />
}

/**
 * Note (2026-10-01 — LiveKit migration):
 *   The previous self-hosted WebRTC stack required a long-lived
 *   background signaling service to be mounted here so buddies on
 *   non-/chat pages could receive incoming offers. LiveKit handles
 *   that centrally on its server, so no equivalent background mount
 *   is needed — incoming calls surface via the `pending_calls`
 *   INSERT-driven IncomingCallWatcher.
 */

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
        <GlobalOnlineHeartbeat />
        <GlobalPresenceMount />
        <ActiveCallSheet />
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
      <GlobalOnlineHeartbeat />
      <GlobalPresenceMount />
      <ActiveCallSheet />
    </>
  );
}
