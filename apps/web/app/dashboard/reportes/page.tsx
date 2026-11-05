'use client';

import { useQuery } from '@tanstack/react-query';
import { TrendingUp, ClipboardList, AlertTriangle } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Skeleton, ErrorState } from '@/components/ui/states';
import { cop } from '@/lib/status-badges';

export const dynamic = 'force-dynamic';

interface Overview {
  recaudoMes: { charged: number; collected: number; pct: number; periodLabel: string };
  pqr: { OPEN: number; IN_REVIEW: number; RESOLVED: number; CLOSED: number; total: number };
  moraAging: { unitsInMora: number; totalMora: number };
}

const PQR_ROWS: { key: keyof Overview['pqr']; label: string; color: string }[] = [
  { key: 'OPEN', label: 'Abiertas', color: 'bg-blue-500' },
  { key: 'IN_REVIEW', label: 'En revisión', color: 'bg-yellow-500' },
  { key: 'RESOLVED', label: 'Resueltas', color: 'bg-green-500' },
  { key: 'CLOSED', label: 'Cerradas', color: 'bg-gray-400' },
];

export default function ReportesPage() {
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['reportes', 'overview'],
    queryFn: () => api.get<Overview>('/reportes/overview'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
        <p className="mt-1 text-sm text-nexo-muted">Resumen financiero y operativo del conjunto.</p>
      </div>

      {isLoading ? (
        <Card className="p-5">
          <Skeleton rows={5} />
        </Card>
      ) : isError ? (
        <ErrorState error={error} />
      ) : data ? (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard
              icon={TrendingUp}
              label={`Recaudo · ${data.recaudoMes.periodLabel}`}
              value={`${data.recaudoMes.pct}%`}
              hint={`${cop(data.recaudoMes.collected)} de ${cop(data.recaudoMes.charged)}`}
            />
            <StatCard
              icon={ClipboardList}
              label="PQRs totales"
              value={String(data.pqr.total)}
              hint={`${data.pqr.OPEN + data.pqr.IN_REVIEW} pendientes`}
            />
            <StatCard
              icon={AlertTriangle}
              label="Unidades en mora"
              value={String(data.moraAging.unitsInMora)}
              hint={`${cop(data.moraAging.totalMora)} en recargos`}
            />
          </section>

          <Card className="p-5">
            <h2 className="text-base font-semibold tracking-tight">Recaudo del mes</h2>
            <div className="mt-3 h-3 w-full overflow-hidden rounded-full bg-nexo-bg">
              <div
                className="h-full rounded-full bg-nexo-teal transition-all"
                style={{ width: `${Math.min(100, data.recaudoMes.pct)}%` }}
              />
            </div>
            <div className="mt-2 flex justify-between text-sm text-nexo-muted">
              <span>Recaudado: {cop(data.recaudoMes.collected)}</span>
              <span>Facturado: {cop(data.recaudoMes.charged)}</span>
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold tracking-tight">Solicitudes (PQR) por estado</h2>
            <div className="mt-3 space-y-2">
              {PQR_ROWS.map((row) => {
                const count = data.pqr[row.key];
                const pct = data.pqr.total > 0 ? (count / data.pqr.total) * 100 : 0;
                return (
                  <div key={row.key} className="flex items-center gap-3">
                    <span className="w-24 text-sm text-nexo-muted">{row.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-nexo-bg">
                      <div className={`h-full rounded-full ${row.color}`} style={{ width: `${pct}%` }} />
                    </div>
                    <span className="w-8 text-right text-sm font-medium">{count}</span>
                  </div>
                );
              })}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
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
      <div className="mt-3 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-nexo-muted">{hint}</div>
    </Card>
  );
}
