'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, CreditCard, ClipboardList, LayoutGrid, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const TABS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Inicio', href: '/portal', icon: Home },
  { label: 'Pagos', href: '/portal/pagos', icon: CreditCard },
  { label: 'Solicitudes', href: '/portal/solicitudes', icon: ClipboardList },
  { label: 'Más', href: '/portal/mas', icon: LayoutGrid },
];

export function PortalNav() {
  const pathname = usePathname();
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-nexo-border bg-nexo-surface md:hidden">
      <div className="mx-auto grid max-w-md grid-cols-4">
        {TABS.map((t) => {
          const active = t.href === '/portal' ? pathname === '/portal' : pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={cn(
                'flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors',
                active ? 'text-nexo-teal' : 'text-nexo-muted',
              )}
            >
              <t.icon className="h-5 w-5" />
              {t.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
