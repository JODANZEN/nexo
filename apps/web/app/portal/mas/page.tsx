'use client';

import Link from 'next/link';
import { FileText, QrCode, User, ChevronRight, type LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';

const ITEMS: { label: string; href: string; icon: LucideIcon }[] = [
  { label: 'Documentos', href: '/portal/documentos', icon: FileText },
  { label: 'Visitas', href: '/portal/visitas', icon: QrCode },
  { label: 'Perfil', href: '/portal/perfil', icon: User },
];

export default function PortalMas() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Más</h1>
      <Card className="overflow-hidden">
        <ul className="divide-y divide-nexo-border">
          {ITEMS.map((it) => (
            <li key={it.href}>
              <Link href={it.href} className="flex items-center gap-3 px-5 py-4 transition-colors hover:bg-nexo-bg">
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
                  <it.icon className="h-4 w-4" />
                </span>
                <span className="flex-1 text-sm font-medium">{it.label}</span>
                <ChevronRight className="h-4 w-4 text-nexo-faint" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
