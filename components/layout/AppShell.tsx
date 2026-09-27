'use client';

import { usePathname } from 'next/navigation';
import Header from './Header';
import Footer from './Footer';
import DaNangBackdrop from './DaNangBackdrop';
import MiniChatWindow from '@/components/chat/MiniChatWindow';

const ROLE_LAYOUTS = ['/tourist', '/buddy'];
const AUTH_PAGES = ['/login', '/register', '/forgot-password', '/reset-password', '/verify-email'];

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
      <Header />
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
