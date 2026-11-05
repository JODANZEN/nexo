import type { ReactNode } from 'react';
import Link from 'next/link';
import { UserButton } from '@clerk/nextjs';
import { NexoLogo } from '@/components/nexo-logo';
import { NotificationsBell } from '@/components/dashboard/notifications-bell';

export const dynamic = 'force-dynamic';

// Staff app: phone-first, one column, nothing but their assigned work.
export default function TareasLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-nexo-bg">
      <header className="sticky top-0 z-10 border-b border-nexo-border bg-nexo-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between px-4 py-3">
          <Link href="/tareas" className="text-nexo-navy">
            <NexoLogo />
          </Link>
          <div className="flex items-center gap-3">
            <NotificationsBell />
            <UserButton afterSignOutUrl="/sign-in" />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-xl px-4 py-5 pb-16">{children}</main>
    </div>
  );
}
