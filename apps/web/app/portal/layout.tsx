import type { ReactNode } from 'react';
import { PortalHeader } from '@/components/portal/portal-header';
import { PortalNav } from '@/components/portal/portal-nav';
import { PortalSidebar } from '@/components/portal/portal-sidebar';

export const dynamic = 'force-dynamic';

export default function PortalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen bg-nexo-bg">
      {/* Desktop: left sidebar. Mobile: bottom tab bar (PortalNav). */}
      <PortalSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <PortalHeader />
        <main className="mx-auto w-full max-w-md px-4 py-5 pb-24 md:max-w-2xl md:px-8 md:pb-10">
          {children}
        </main>
        <PortalNav />
      </div>
    </div>
  );
}
