'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import DaNangBackdrop from './DaNangBackdrop';
import MiniChatWindow from '@/components/chat/MiniChatWindow';
import IncomingCallWatcher from '@/components/chat/IncomingCallWatcher';
import OutgoingCallPanel from '@/components/chat/OutgoingCallPanel';
import ActiveCallSheet from '@/components/layout/ActiveCallSheet';
import SessionExpiryGuard from '@/components/layout/SessionExpiryGuard';
import FocusRequestPopover from '@/components/focus/FocusRequestPopover';
import MessagePopover from '@/components/chat/MessagePopover';
import { useAuthUser } from '@/lib/auth/useAuthUser';
import { useOnlineHeartbeat } from '@/lib/realtime/useOnlineHeartbeat';
import { GlobalPresence } from '@/lib/realtime/useGlobalPresence';
import GlobalConnectionRefresher from '@/components/connection/GlobalConnectionRefresher';

/**
 * 2026-10-01 — Unified single-web architecture.
 *
 * Previously the AppShell branched on `/tourist/*` vs everything else
 * to render a tourist-only chrome (Header with role-specific nav,
 * Footer). After the unification, every authenticated route renders
 * the same chrome — Header (which itself no longer branches on role)
 * + Footer + the global mounts.
 *
 * `ROLE_LAYOUTS` is intentionally empty so authenticated pages fall
 * through to the third branch below. Auth-only pages still get a
 * bare render (no header/footer).
 */
const ROLE_LAYOUTS: string[] = [];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

function AuthAwareHeader() {
  const auth = useAuthUser()
  const name = auth?.fullName
  const userId = auth?.userId
  const avatarUrl = auth?.avatarUrl

  if (auth) {
    return <Header userName={name} userId={userId} avatarUrl={avatarUrl} />
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
 * Symmetric counterpart for the caller — a small floating card
 * showing "Calling X…" / "Connecting…" + an End button. The caller
 * also gets the full CallModal at the centre of the screen; this
 * panel is just a glanceable status indicator while the modal is
 * behind the user's attention.
 */
function GlobalOutgoingCallPanel() {
  return <OutgoingCallPanel />
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
 * `usePresenceOf(userId)` / `useIsOnline(userId)`.
 */
function GlobalPresenceMount() {
  const auth = useAuthUser()
  return <GlobalPresence userId={auth?.userId ?? null} />
}

/**
 * 2026-10-10 — global Focus request popover. The popover subscribes
 * to `focus_requests` INSERTs for the current user and surfaces a
 * centered modal regardless of which page the recipient is on. On
 * Accept, we hard-navigate to /focus/<sessionId>; on Decline, the
 * popover closes and the requester sees a focus_declined
 * notification.
 */
function GlobalFocusRequestPopover() {
  const auth = useAuthUser()
  return <FocusRequestPopover userId={auth?.userId ?? null} />
}

/**
 * 2026-10-10 — global message toast. Surfaces an incoming chat
 * message as a small popover in the bottom-right. The popover is
 * hidden on /chat (the message is already visible in the thread)
 * and on /focus/<id> (Focus has its own embedded chat; surfacing
 * the popover on top would be visual noise).
 */
function GlobalMessagePopover() {
  const pathname = usePathname()
  const auth = useAuthUser()
  if (pathname.startsWith('/focus/')) return null
  if (pathname === '/chat') return null
  return <MessagePopover userId={auth?.userId ?? null} />
}

/**
 * Note (2026-10-01 — LiveKit migration):
 *   LiveKit handles incoming-call signaling centrally on its server,
 *   so no equivalent background WebRTC mount is needed — incoming
 *   calls surface via the `pending_calls` INSERT-driven
 *   IncomingCallWatcher.
 */

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const inRoleLayout = ROLE_LAYOUTS.some((p) => pathname.startsWith(p));
  const isAuthPage = AUTH_PAGES.includes(pathname);
  // 2026-10-10 — Focus Mode has its own header + chat + map; the
  // global MiniChatWindow (which has its own Phone button) and the
  // ActiveCallSheet (voice-call modal) would visually compete with
  // the focus UI. Hide them on the focus route. Incoming calls
  // still ring the partner when focus is open via the global
  // IncomingCallWatcher, but the in-page surfaces are off.
  const isFocusPage = pathname.startsWith('/focus/')

  // 4-role palette needs the current user's role on the <main> element so
  // CSS can recolor every `bg-primary` button via the
  // `main[data-role="tourist"]` selector in app/globals.css.
  const auth = useAuthUser()
  const role = (auth as { role?: 'tourist' | 'buddy' | 'admin' | null } | null)?.role
  const mainDataRole =
    role === 'tourist' || role === 'buddy' || role === 'admin' ? role : undefined

  if (isAuthPage) {
    return <>{children}</>;
  }

  if (inRoleLayout) {
    return (
      <>
        <DaNangBackdrop />
        {children}
        <Footer />
      <SessionExpiryGuard />
      {!isFocusPage ? <MiniChatWindow /> : null}
      <GlobalIncomingCallWatcher />
      <GlobalOutgoingCallPanel />
      <GlobalOnlineHeartbeat />
      <GlobalPresenceMount />
      <GlobalFocusRequestPopover />
      <GlobalMessagePopover />
      {!isFocusPage ? <ActiveCallSheet /> : null}
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
        data-role={mainDataRole}
      >
        {children}
      </main>
      <Footer />
      <SessionExpiryGuard />
      {!isFocusPage ? <MiniChatWindow /> : null}
      <GlobalIncomingCallWatcher />
      <GlobalOutgoingCallPanel />
      <GlobalOnlineHeartbeat />
      <GlobalPresenceMount />
      <GlobalFocusRequestPopover />
      <GlobalMessagePopover />
      <GlobalConnectionRefresher />
      {!isFocusPage ? <ActiveCallSheet /> : null}
    </>
  );
}