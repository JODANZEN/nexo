'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Home,
  Building2,
  CreditCard,
  ClipboardList,
  FileText,
  Users,
  CalendarDays,
  Network,
  Megaphone,
  BarChart3,
  Settings,
  Headphones,
  Vote,
  ParkingSquare,
  ShieldCheck,
  ClipboardCheck,
  BookOpen,
  Sparkles,
  Lock,
  Route,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { FeatureKey } from '@nexo/types';
import { NexoLogo } from '@/components/nexo-logo';
import { useEntitlements } from '@/lib/use-entitlements';
import { cn } from '@/lib/utils';

interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  feature?: FeatureKey; // gated when set; undefined = always available
}

const NAV: NavItem[] = [
  { label: 'Inicio', href: '/dashboard', icon: Home },
  { label: 'Propiedades', href: '/dashboard/propiedades', icon: Building2 },
  { label: 'Inspecciones', href: '/dashboard/inspecciones', icon: ClipboardCheck, feature: 'inspecciones' },
  { label: 'Pagos', href: '/dashboard/pagos', icon: CreditCard, feature: 'pagos' },
  { label: 'Contabilidad', href: '/dashboard/contabilidad', icon: BookOpen, feature: 'contabilidad.lite' },
  { label: 'Solicitudes', href: '/dashboard/solicitudes', icon: ClipboardList, feature: 'pqr' },
  { label: 'Operación', href: '/dashboard/operacion', icon: Route, feature: 'pqr' },
  { label: 'Mantenimiento', href: '/dashboard/mantenimiento', icon: Wrench, feature: 'pqr' },
  { label: 'Asamblea', href: '/dashboard/asambleas', icon: Vote, feature: 'asambleas' },
  { label: 'Portería', href: '/dashboard/porteria', icon: ShieldCheck, feature: 'porteria' },
  { label: 'Parqueaderos', href: '/dashboard/porteria/parking', icon: ParkingSquare, feature: 'parqueaderos' },
  { label: 'Iris IA', href: '/dashboard/iris', icon: Sparkles, feature: 'iris' },
  { label: 'Documentos', href: '/dashboard/documentos', icon: FileText, feature: 'documentos' },
  { label: 'Comunidad', href: '/dashboard/comunidad', icon: Users, feature: 'comunidad' },
  { label: 'Reservas', href: '/dashboard/reservas', icon: CalendarDays, feature: 'reservas' },
  { label: 'Proveedores', href: '/dashboard/proveedores', icon: Network },
  { label: 'Anuncios', href: '/dashboard/anuncios', icon: Megaphone, feature: 'anuncios' },
  { label: 'Reportes', href: '/dashboard/reportes', icon: BarChart3, feature: 'reportes' },
  { label: 'Configuración', href: '/dashboard/configuracion', icon: Settings, feature: 'configuracion' },
];

export function Sidebar() {
  const pathname = usePathname();
  const { has } = useEntitlements();

  // Highlight only the single best match: the longest nav href that prefixes the
  // current path. Prevents a parent (/dashboard/porteria) from staying active on
  // a child route (/dashboard/porteria/parking).
  const matches = (h: string) =>
    h === '/dashboard' ? pathname === h : pathname === h || pathname.startsWith(h + '/');
  const activeHref = NAV.map((i) => i.href)
    .filter(matches)
    .sort((a, b) => b.length - a.length)[0];

  return (
    <aside className="hidden w-64 shrink-0 flex-col bg-[var(--sidebar-bg)] px-4 py-6 text-[var(--sidebar-text)] md:flex">
      <div className="px-2 text-[var(--sidebar-text-active)]">
        <NexoLogo />
      </div>

      <nav className="mt-8 flex-1 space-y-1">
        {NAV.map((item) => {
          const locked = item.feature ? !has(item.feature) : false;
          const active = item.href === activeHref;

          if (locked) {
            return (
              <Link
                key={item.label}
                href="/dashboard/configuracion"
                title="Función de un plan superior"
                className="flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2.5 text-sm font-medium text-[var(--sidebar-text)]/50 transition-colors hover:bg-[var(--sidebar-hover-bg)]"
              >
                <item.icon className="h-[18px] w-[18px]" />
                <span className="flex-1">{item.label}</span>
                <Lock className="h-3.5 w-3.5" />
              </Link>
            );
          }

          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg border-l-2 border-transparent px-3 py-2.5 text-sm font-medium transition-colors',
                active
                  ? 'border-[var(--sidebar-active-border)] bg-[var(--sidebar-active-bg)] text-[var(--sidebar-text-active)]'
                  : 'text-[var(--sidebar-text)] hover:bg-[var(--sidebar-hover-bg)] hover:text-[var(--sidebar-text-active)]',
              )}
            >
              <item.icon className="h-[18px] w-[18px]" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <Link
        href="/dashboard/ayuda"
        className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--sidebar-hover-bg)] px-3 py-3 transition-colors hover:bg-[var(--sidebar-active-bg)]"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-nexo-teal/20 text-nexo-teal">
          <Headphones className="h-[18px] w-[18px]" />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-medium text-[var(--sidebar-text-active)]">¿Necesitas ayuda?</span>
          <span className="block text-xs text-[var(--sidebar-text)]">Centro de ayuda</span>
        </span>
      </Link>
    </aside>
  );
}
