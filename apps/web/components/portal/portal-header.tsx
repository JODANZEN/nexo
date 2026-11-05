'use client';

import Link from 'next/link';
import { Bell } from 'lucide-react';
import { UserButton } from '@clerk/nextjs';
import { NexoLogo } from '@/components/nexo-logo';

export function PortalHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-nexo-border bg-nexo-surface">
      <div className="mx-auto flex max-w-md items-center justify-between px-4 py-3 md:max-w-none md:justify-end md:px-8">
        {/* Logo lives in the sidebar on desktop, so only show it on mobile. */}
        <Link href="/portal" className="text-nexo-navy md:hidden">
          <NexoLogo />
        </Link>
        <div className="flex items-center gap-3">
          <button className="relative text-nexo-muted" aria-label="Notificaciones">
            <Bell className="h-5 w-5" />
          </button>
          <UserButton afterSignOutUrl="/sign-in" />
        </div>
      </div>
    </header>
  );
}
