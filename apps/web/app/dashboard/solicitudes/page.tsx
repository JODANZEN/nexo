'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PQR_STATUS, PQR_CATEGORY } from '@/lib/status-badges';
import { PRIORITY, SCOPE, slaState } from '@/lib/ticket-labels';
import { cn } from '@/lib/utils';

interface Pqr {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  scope: string;
  resolution_due_at: string | null;
  sla_breached: boolean;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SolicitudesPage() {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pqrs'],
    queryFn: () => api.get<Pqr[]>('/pqrs'),
  });

  const rows = data ?? [];
  const active = rows.filter((p) => p.status === 'OPEN' || p.status === 'IN_REVIEW');
  const awaiting = rows.filter((p) => p.status === 'AWAITING_RESIDENT');
  const breached = rows.filter((p) => p.sla_breached && p.status !== 'CLOSED');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Solicitudes</h1>
        <p className="mt-1 text-sm text-nexo-muted">Tickets (PQR) con prioridad y SLA.</p>
      </div>

      {rows.length > 0 ? (
        <section className="grid grid-cols-3 gap-4">
          <Stat label="Activas" value={active.length} />
          <Stat label="Esperando residente" value={awaiting.length} accent="text-purple-600" />
          <Stat label="SLA incumplido" value={breached.length} accent={breached.length ? 'text-red-600' : undefined} />
        </section>
      ) : null}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando solicitudes…
          </div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-red-600">Error al cargar: {(error as Error).message}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-nexo-muted">Sin solicitudes aún.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {rows.map((pqr) => {
              const st = PQR_STATUS[pqr.status] ?? { label: pqr.status, badge: 'bg-gray-100 text-gray-600' };
              const pr = PRIORITY[pqr.priority] ?? { label: pqr.priority, badge: 'bg-gray-100 text-gray-600' };
              const sla = slaState(pqr);
              return (
                <li key={pqr.id}>
                  <Link
                    href={`/dashboard/solicitudes/${pqr.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-nexo-bg"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', pr.badge)}>{pr.label}</span>
                        <span className="font-medium">{pqr.title}</span>
                        <span className="text-xs text-nexo-muted">
                          {SCOPE[pqr.scope] ?? pqr.scope} · {PQR_CATEGORY[pqr.category] ?? pqr.category}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-nexo-muted">{pqr.description}</p>
                      <p className="mt-1 text-xs">
                        <span className="text-nexo-muted">{fmtDate(pqr.created_at)}</span>
                        {sla.text ? <span className={cn('ml-2', sla.cls)}>· {sla.text}</span> : null}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-nexo-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold', accent ?? 'text-nexo-text')}>{value}</div>
    </Card>
  );
}
