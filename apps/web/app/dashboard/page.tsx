'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  CreditCard,
  FileText,
  Megaphone,
  Network,
  Wrench,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import type { BillingSnapshot } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/states';

interface PqrItem {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
}
interface DocItem {
  documentId: string;
  title: string;
  createdAt: string;
}

const PHASE_LABEL: Record<BillingSnapshot['billingPhase'], string> = {
  PRONTO_PAGO: 'Pronto pago',
  TARIFA_PLENA: 'Al día',
  MORA: 'En mora',
};

function cop(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InicioPage() {
  const api = useApi();
  const { user } = useUser();
  const unitId = user?.publicMetadata?.unitId as string | undefined;

  const balance = useQuery({
    queryKey: ['balance', unitId],
    queryFn: () => api.get<BillingSnapshot>(`/billing/units/${unitId}/balance`),
    enabled: !!unitId,
  });
  const openPqrs = useQuery({
    queryKey: ['pqrs', 'OPEN'],
    queryFn: () => api.get<PqrItem[]>('/pqrs?status=OPEN'),
  });
  const recentPqrs = useQuery({ queryKey: ['pqrs'], queryFn: () => api.get<PqrItem[]>('/pqrs') });
  const recentDocs = useQuery({ queryKey: ['documents'], queryFn: () => api.get<DocItem[]>('/documents') });

  const isAdmin = (user?.publicMetadata?.role as string | undefined) === 'ADMIN';
  const cartera = useQuery({
    queryKey: ['billing', 'units'],
    queryFn: () => api.get<BillingSnapshot[]>('/billing/units'),
    enabled: isAdmin,
  });
  const carteraTotal = (cartera.data ?? []).reduce((s, u) => s + u.totalDue, 0);
  const moraCount = (cartera.data ?? []).filter((u) => u.billingPhase === 'MORA').length;

  const b = balance.data;
  const dash = '—';
  const loadError = balance.error ?? openPqrs.error ?? recentPqrs.error ?? recentDocs.error;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hola, {user?.firstName ?? 'Admin'} 👋</h1>
        <p className="mt-1 text-sm text-nexo-muted">
          {isAdmin
            ? 'Resumen del conjunto y actividad reciente.'
            : 'Aquí tienes el resumen de tu propiedad y actividad reciente.'}
        </p>
      </div>

      {loadError ? <ErrorState error={loadError} /> : null}

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {isAdmin ? (
          <>
            <StatCard
              icon={Building2}
              label="Unidades"
              value={cartera.data ? String(cartera.data.length) : cartera.isLoading ? '…' : dash}
              hint="En el conjunto"
            />
            <StatCard
              icon={CalendarDays}
              label="Cartera por cobrar"
              eyebrow="Total pendiente"
              value={cartera.data ? cop(carteraTotal) : cartera.isLoading ? '…' : dash}
              hint="Suma de saldos"
            />
            <StatCard
              icon={CheckCircle2}
              label="Unidades en mora"
              value={cartera.data ? String(moraCount) : cartera.isLoading ? '…' : dash}
              valueClassName={moraCount > 0 ? 'text-red-600' : 'text-nexo-teal'}
              hint="Requieren gestión"
            />
            <StatCard
              icon={ClipboardList}
              label="Solicitudes abiertas"
              value={openPqrs.data ? String(openPqrs.data.length) : openPqrs.isLoading ? '…' : dash}
              hint="PQR pendientes"
            />
          </>
        ) : (
          <>
            <StatCard icon={Building2} label="Total propiedades" value={unitId ? '1' : dash} hint="Unidad activa" />
            <StatCard
              icon={CalendarDays}
              label="Próximo pago"
              eyebrow="Administración"
              value={b ? cop(b.totalDue) : balance.isLoading ? '…' : dash}
              hint={b && b.totalDue > 0 ? `Vence el ${fmtDate(b.dueDate)}` : 'Sin saldo pendiente'}
            />
            <StatCard
              icon={CheckCircle2}
              label="Estado de pagos"
              value={b ? PHASE_LABEL[b.billingPhase] : dash}
              valueClassName="text-nexo-teal"
              hint="Según tu cartera"
            />
            <StatCard
              icon={ClipboardList}
              label="Solicitudes abiertas"
              value={openPqrs.data ? String(openPqrs.data.length) : openPqrs.isLoading ? '…' : dash}
              hint="Ver pendientes"
            />
          </>
        )}
      </section>

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="hidden overflow-hidden md:block">
          <div className="p-5 pb-0">
            <h3 className="text-base font-semibold tracking-tight">Resumen de tu propiedad</h3>
          </div>
          <div className="p-5">
            <div className="flex h-40 items-center justify-center rounded-lg bg-gradient-to-br from-nexo-navy to-nexo-navyLight">
              <Building2 className="h-12 w-12 text-white/40" />
            </div>
            <div className="mt-4">
              <div className="text-base font-semibold">{b ? `Unidad ${b.unitNumber}` : 'Tu unidad'}</div>
              <div className="text-sm text-nexo-muted">{b ? b.periodLabel || 'Sin período activo' : ''}</div>
            </div>
            <Link href="/mi-cuenta">
              <Button className="mt-4 w-full">Ver mi cuenta</Button>
            </Link>
          </div>
        </Card>

        <Card className="lg:col-span-1">
          <div className="p-5 pb-2">
            <h3 className="text-base font-semibold tracking-tight">Actividad reciente</h3>
          </div>
          <div className="divide-y divide-nexo-border">
            {(recentPqrs.data ?? []).slice(0, 3).map((p) => (
              <ActivityRow
                key={p.id}
                icon={p.status === 'RESOLVED' ? CheckCircle2 : Wrench}
                title={p.title}
                desc={`Solicitud · ${p.category}`}
                meta={fmtDate(p.created_at)}
              />
            ))}
            {(recentDocs.data ?? []).slice(0, 2).map((d) => (
              <ActivityRow key={d.documentId} icon={FileText} title={d.title} desc="Documento" meta={fmtDate(d.createdAt)} />
            ))}
            {!recentPqrs.isLoading &&
            (recentPqrs.data?.length ?? 0) === 0 &&
            (recentDocs.data?.length ?? 0) === 0 ? (
              <p className="px-5 py-4 text-sm text-nexo-muted">Sin actividad reciente.</p>
            ) : null}
          </div>
          <div className="p-5 pt-3">
            <Link href="/dashboard/solicitudes" className="text-sm font-medium text-nexo-navy hover:underline">
              Ver todas las actividades →
            </Link>
          </div>
        </Card>

        <Card>
          <div className="p-5 pb-2">
            <h3 className="text-base font-semibold tracking-tight">Accesos rápidos</h3>
          </div>
          <div className="divide-y divide-nexo-border">
            <QuickAction icon={CreditCard} label="Realizar un pago" href="/dashboard/pagos" />
            <QuickAction icon={ClipboardList} label="Crear solicitud" href="/mi-cuenta" />
            <QuickAction icon={FileText} label="Subir documento" href="/dashboard/documentos" />
            <QuickAction icon={CalendarDays} label="Reservar zona común" href="/dashboard/reservas" />
            <QuickAction icon={Megaphone} label="Publicar anuncio" href="/dashboard/anuncios" />
            <QuickAction icon={Network} label="Ver proveedores" href="/dashboard/proveedores" />
          </div>
        </Card>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  eyebrow,
  value,
  valueClassName,
  hint,
}: {
  icon: LucideIcon;
  label: string;
  eyebrow?: string;
  value: string;
  valueClassName?: string;
  hint: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between">
        <span className="text-sm font-medium text-nexo-muted">{label}</span>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3">
        {eyebrow ? <div className="text-xs text-nexo-muted">{eyebrow}</div> : null}
        <div className={`text-2xl font-bold ${valueClassName ?? ''}`}>{value}</div>
        <div className="mt-1 text-xs text-nexo-muted">{hint}</div>
      </div>
    </Card>
  );
}

function ActivityRow({
  icon: Icon,
  title,
  desc,
  meta,
}: {
  icon: LucideIcon;
  title: string;
  desc: string;
  meta: string;
}) {
  return (
    <div className="flex gap-3 px-5 py-3.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nexo-bg text-nexo-navy">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <span className="text-sm font-medium">{title}</span>
        <p className="truncate text-sm text-nexo-muted">{desc}</p>
        <p className="mt-0.5 text-xs text-nexo-muted">{meta}</p>
      </div>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href }: { icon: LucideIcon; label: string; href: string }) {
  return (
    <Link href={href} className="flex w-full items-center gap-3 px-5 py-3.5 text-left transition-colors hover:bg-nexo-bg">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
        <Icon className="h-4 w-4" />
      </span>
      <span className="flex-1 text-sm font-medium">{label}</span>
      <ChevronRight className="h-4 w-4 text-nexo-muted" />
    </Link>
  );
}
