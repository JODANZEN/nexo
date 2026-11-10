'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { Home, CreditCard, ClipboardList, User, Plus, ShieldCheck, ParkingSquare, Megaphone, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

const NAV: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', icon: Home },
  { label: 'Pagos', href: '/dashboard/pagos', icon: CreditCard },
  { label: 'Solicitudes', href: '/dashboard/solicitudes', icon: ClipboardList },
  { label: 'Perfil', href: '/mi-cuenta', icon: User },
];

// Portería (GUARD): only its own screens (same list the proxy allows).
const GUARD_NAV: NavItem[] = [
  { label: 'Portería', href: '/dashboard/porteria', icon: ShieldCheck },
  { label: 'Parqueaderos', href: '/dashboard/porteria/parking', icon: ParkingSquare },
  { label: 'Anuncios', href: '/dashboard/anuncios', icon: Megaphone },
];

// Bottom tab bar with a centered teal FAB (mobile only).
export function MobileNav() {
  const pathname = usePathname();
  const { user, isLoaded } = useUser();
  if (!isLoaded) return null;

  if (user?.publicMetadata?.role === 'GUARD') {
    const active = GUARD_NAV.map((i) => i.href)
      .filter((h) => pathname === h || pathname.startsWith(h + '/'))
      .sort((a, b) => b.length - a.length)[0];
    return (
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-nexo-border bg-white md:hidden">
        <div className="mx-auto grid max-w-md grid-cols-3 items-center px-2 py-2">
          {GUARD_NAV.map((item) => (
            <Tab key={item.label} item={item} active={item.href === active} />
          ))}
        </div>
      </nav>
    );
  }

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-nexo-border bg-white md:hidden">
      <div className="relative mx-auto grid max-w-md grid-cols-5 items-center px-2 py-2">
        {NAV.slice(0, 2).map((item) => (
          <Tab key={item.label} item={item} active={isActive(pathname, item.href)} />
        ))}

        <div className="flex justify-center">
          <button
            className="-mt-8 flex h-14 w-14 items-center justify-center rounded-full bg-nexo-teal text-white shadow-lg shadow-nexo-teal/30"
            aria-label="Crear"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>

        {NAV.slice(2).map((item) => (
          <Tab key={item.label} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
    </nav>
  );
}

function isActive(pathname: string, href: string): boolean {
  return href === '/dashboard' ? pathname === href : pathname.startsWith(href);
}

function Tab({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link
      href={item.href}
      className={cn(
        'flex flex-col items-center gap-1 text-[11px] font-medium',
        active ? 'text-nexo-navy' : 'text-nexo-muted',
      )}
    >
      <item.icon className="h-5 w-5" />
      {item.label}
    </Link>
  );
}
