'use client';

import Link from 'next/link';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import {
  CreditCard,
  ClipboardList,
  FileText,
  QrCode,
  Package,
  ChevronRight,
  Loader2,
  type LucideIcon,
} from 'lucide-react';
import type { BillingSnapshot } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BILLING_PHASE, PQR_CATEGORY, cop } from '@/lib/status-badges';
import { ErrorState } from '@/components/ui/states';
import { cn } from '@/lib/utils';
import { InstallPrompt } from '@/components/install-prompt';

interface Pqr {
  id: string;
  title: string;
  category: string;
  status: string;
  created_at: string;
}
interface Delivery {
  id: string;
  carrier: string;
  received_at: string;
}
interface Announcement {
  id: string;
  title: string;
  body: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
}

export default function PortalInicio() {
  const api = useApi();
  const { user } = useUser();
  const unitId = user?.publicMetadata?.unitId as string | undefined;

  const balance = useQuery({
    queryKey: ['balance', unitId],
    queryFn: () => api.get<BillingSnapshot>(`/billing/units/${unitId}/balance`),
    enabled: !!unitId,
  });
  const pqrs = useQuery({ queryKey: ['pqrs'], queryFn: () => api.get<Pqr[]>('/pqrs') });
  const deliveries = useQuery({
    queryKey: ['deliveries', unitId],
    queryFn: () => api.get<Delivery[]>(`/deliveries?unitId=${unitId}`),
    enabled: !!unitId,
  });
  const anuncios = useQuery({
    queryKey: ['anuncios', 'portal'],
    queryFn: () => api.get<Announcement[]>('/anuncios?take=3'),
  });

  const pay = useMutation({
    mutationFn: () =>
      api.post<{ paymentLinkUrl: string }>('/payments/links/generate', {
        unitId,
        chargeIds: balance.data?.outstandingChargeIds,
        paymentMethod: 'PSE',
      }),
    onSuccess: (r) => window.open(r.paymentLinkUrl, '_blank', 'noopener,noreferrer'),
  });

  const b = balance.data;
  const phase = b ? BILLING_PHASE[b.billingPhase] : null;

  const loadError = balance.error ?? pqrs.error ?? deliveries.error;

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Hola, {user?.firstName ?? 'Residente'} 👋</h1>

      <InstallPrompt />

      {loadError ? <ErrorState error={loadError} /> : null}

      <Card className="overflow-hidden">
        <div className="bg-gradient-to-br from-nexo-navy to-nexo-navyLight p-5 text-white">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/70">Total a pagar</span>
            {phase ? (
              <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', phase.badge)}>
                {phase.label}
              </span>
            ) : null}
          </div>
          <div className="mt-1 text-3xl font-bold">
            {b ? cop(b.totalDue) : balance.isLoading ? '…' : '—'}
          </div>
          <div className="mt-1 text-sm text-white/70">
            {b && b.totalDue > 0 ? `Vence el ${fmtDate(b.dueDate)}` : 'Sin saldo pendiente'}
          </div>
        </div>
        <div className="p-4">
          <Button
            variant="accent"
            className="w-full"
            disabled={!b || b.totalDue <= 0 || pay.isPending}
            onClick={() => pay.mutate()}
          >
            {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pagar ahora'}
          </Button>
        </div>
      </Card>

      <div className="grid grid-cols-4 gap-2">
        <QuickAction icon={CreditCard} label="Pagar" href="/portal/pagos" />
        <QuickAction icon={ClipboardList} label="Solicitud" href="/portal/solicitudes" />
        <QuickAction icon={FileText} label="Documentos" href="/portal/documentos" />
        <QuickAction icon={QrCode} label="QR visita" href="/portal/visitas" />
      </div>

      {anuncios.data && anuncios.data.length > 0 ? (
        <Card className="p-5">
          <h2 className="text-base font-semibold tracking-tight">Anuncios</h2>
          <div className="mt-2 divide-y divide-nexo-border">
            {anuncios.data.map((a) => (
              <div key={a.id} className="py-3">
                <div className="text-sm font-medium">{a.title}</div>
                <p className="mt-0.5 line-clamp-2 text-sm text-nexo-muted">{a.body}</p>
                <p className="mt-1 text-xs text-nexo-faint">{fmtDate(a.created_at)}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="p-5">
        <h2 className="text-base font-semibold tracking-tight">Actividad reciente</h2>
        <div className="mt-2 divide-y divide-nexo-border">
          {(pqrs.data ?? []).slice(0, 3).map((p) => (
            <Activity
              key={p.id}
              icon={ClipboardList}
              title={p.title}
              meta={`${PQR_CATEGORY[p.category] ?? p.category} · ${fmtDate(p.created_at)}`}
              href={`/portal/solicitudes/${p.id}`}
            />
          ))}
          {(deliveries.data ?? []).slice(0, 1).map((d) => (
            <Activity key={d.id} icon={Package} title={`Paquete · ${d.carrier}`} meta={fmtDate(d.received_at)} />
          ))}
          {!pqrs.isLoading &&
          (pqrs.data?.length ?? 0) === 0 &&
          (deliveries.data?.length ?? 0) === 0 ? (
            <p className="py-3 text-sm text-nexo-muted">Sin actividad reciente.</p>
          ) : null}
        </div>
      </Card>
    </div>
  );
}

function QuickAction({ icon: Icon, label, href }: { icon: LucideIcon; label: string; href: string }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-nexo-border bg-nexo-surface p-3 text-center"
    >
      <span className="flex h-9 w-9 items-center justify-center rounded-full bg-nexo-teal/15 text-nexo-teal">
        <Icon className="h-4 w-4" />
      </span>
      <span className="text-[11px] font-medium text-nexo-text">{label}</span>
    </Link>
  );
}

function Activity({
  icon: Icon,
  title,
  meta,
  href,
}: {
  icon: LucideIcon;
  title: string;
  meta: string;
  href?: string;
}) {
  const inner = (
    <div className="flex items-center gap-3 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-nexo-bg text-nexo-navy">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{title}</div>
        <div className="text-xs text-nexo-muted">{meta}</div>
      </div>
      {href ? <ChevronRight className="h-4 w-4 text-nexo-faint" /> : null}
    </div>
  );
  return href ? <Link href={href}>{inner}</Link> : inner;
}
