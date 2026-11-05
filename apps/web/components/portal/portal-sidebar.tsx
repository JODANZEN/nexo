'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CreditCard, ClipboardList, FileText, QrCode, User, type LucideIcon } from 'lucide-react';
import { NexoLogo } from '@/components/nexo-logo';
import { cn } from '@/lib/utils';

const NAV: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Inicio', href: '/portal', icon: Home },
  { label: 'Pagos', href: '/portal/pagos', icon: CreditCard },
  { label: 'Solicitudes', href: '/portal/solicitudes', icon: ClipboardList },
  { label: 'Documentos', href: '/portal/documentos', icon: FileText },
  { label: 'Visitas', href: '/portal/visitas', icon: QrCode },
  { label: 'Perfil', href: '/portal/perfil', icon: User },
];

// Desktop-only nav for the resident portal. Mobile uses the bottom tab bar.
export function PortalSidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden w-60 shrink-0 flex-col border-r border-nexo-border bg-nexo-surface px-4 py-6 md:flex">
      <Link href="/portal" className="px-2 text-nexo-navy">
        <NexoLogo />
      </Link>
      <nav className="mt-8 space-y-1">
        {NAV.map((item) => {
          const active = item.href === '/portal' ? pathname === '/portal' : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'bg-nexo-teal/10 text-nexo-teal'
                  : 'text-nexo-muted hover:bg-nexo-bg hover:text-nexo-text',
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
