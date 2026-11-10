'use client';

import { Search, MessageSquare, ChevronDown } from 'lucide-react';
import { SignedIn, SignedOut, UserButton, useUser } from '@clerk/nextjs';
import Link from 'next/link';
import { NexoLogo } from '@/components/nexo-logo';
import { NotificationsBell } from '@/components/dashboard/notifications-bell';

const ROLE_LABEL: Record<string, string> = {
  ADMIN: 'Administrador',
  RESIDENT: 'Residente',
  GUARD: 'Portería',
  STAFF: 'Personal',
};

export function Topbar() {
  const { user } = useUser();
  const name =
    user?.fullName ??
    [user?.firstName, user?.lastName].filter(Boolean).join(' ') ??
    '';
  const role = user?.publicMetadata?.role as string | undefined;
  const roleLabel = role ? ROLE_LABEL[role] ?? 'Usuario' : 'Usuario';
  const isGuard = role === 'GUARD'; // guards only work in Portería: no links elsewhere

  return (
    <header className="sticky top-0 z-10 border-b border-nexo-border bg-white">
      {/* Mobile header: logo + notifications */}
      <div className="flex items-center justify-between px-4 py-3 md:hidden">
        <Link href={isGuard ? '/dashboard/porteria' : '/dashboard'} className="text-nexo-navy">
          <NexoLogo />
        </Link>
        <NotificationsBell />
      </div>

      {/* Desktop top bar: search + actions */}
      <div className="hidden items-center gap-4 px-6 py-3 md:flex">
        <label className="relative flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-nexo-muted" />
          <input
            type="search"
            placeholder="Buscar en NEXO..."
            className="h-10 w-full rounded-lg border border-nexo-border bg-nexo-bg pl-9 pr-14 text-sm placeholder:text-nexo-muted focus:outline-none focus:ring-2 focus:ring-nexo-teal"
          />
          <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-nexo-border bg-white px-1.5 py-0.5 text-[10px] font-medium text-nexo-muted">
            ⌘K
          </kbd>
        </label>

        <div className="ml-auto flex items-center gap-2">
          {isGuard ? null : (
          <Link
            href="/dashboard/iris"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-nexo-muted hover:bg-nexo-bg"
            aria-label="Iris IA"
            title="Preguntar a Iris"
          >
            <MessageSquare className="h-5 w-5" />
          </Link>
          )}
          <NotificationsBell />

          <div className="ml-2 flex items-center gap-2 border-l border-nexo-border pl-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-semibold text-nexo-text">{name || 'Usuario'}</div>
              <div className="text-xs text-nexo-muted">{roleLabel}</div>
            </div>
            <SignedIn>
              <UserButton afterSignOutUrl="/sign-in" />
            </SignedIn>
            <SignedOut>
              <Link href="/sign-in" className="text-sm text-nexo-muted hover:text-nexo-text">
                Iniciar sesión
              </Link>
            </SignedOut>
            <ChevronDown className="h-4 w-4 text-nexo-muted" />
          </div>
        </div>
      </div>
    </header>
  );
}
