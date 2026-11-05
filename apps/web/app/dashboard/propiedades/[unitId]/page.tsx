'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ClipboardList, CreditCard, UserCheck, Package, type LucideIcon } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Event {
  at: string;
  kind: 'pqr' | 'payment' | 'visitor' | 'delivery';
  title: string;
  detail?: string;
  link?: string;
}
interface Timeline {
  unit: { id: string; unitNumber: string; roomType: string | null; resident: string | null; phone: string | null };
  events: Event[];
}

const KIND: Record<Event['kind'], { icon: LucideIcon; cls: string }> = {
  pqr: { icon: ClipboardList, cls: 'bg-blue-50 text-blue-700' },
  payment: { icon: CreditCard, cls: 'bg-green-50 text-green-700' },
  visitor: { icon: UserCheck, cls: 'bg-purple-50 text-purple-700' },
  delivery: { icon: Package, cls: 'bg-amber-50 text-amber-700' },
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function UnitTimelinePage() {
  const { unitId } = useParams<{ unitId: string }>();
  const api = useApi();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['traceability', unitId],
    queryFn: () => api.get<Timeline>(`/traceability/units/${unitId}`),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link href="/dashboard/propiedades" className="text-sm text-nexo-muted hover:text-nexo-text">
        ← Volver a propiedades
      </Link>

      {isLoading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-nexo-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : isError || !data ? (
        <p className="py-10 text-sm text-red-600">{(error as Error)?.message ?? 'No encontrada'}</p>
      ) : (
        <>
          <Card className="p-5">
            <h1 className="text-2xl font-bold tracking-tight">Unidad {data.unit.unitNumber}</h1>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-nexo-muted">
              <span>Tipo: {data.unit.roomType ?? 'Sin tipo'}</span>
              <span>·</span>
              <span>Residente: {data.unit.resident ?? 'No asignado'}</span>
              {data.unit.phone ? (
                <>
                  <span>·</span>
                  <span>{data.unit.phone}</span>
                </>
              ) : null}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold tracking-tight">Trazabilidad</h2>
            <p className="text-xs text-nexo-muted">Historial de solicitudes, pagos, visitas y entregas.</p>
            {data.events.length === 0 ? (
              <p className="mt-4 text-sm text-nexo-muted">Sin actividad registrada.</p>
            ) : (
              <ol className="mt-4 space-y-3">
                {data.events.map((e, i) => {
                  const k = KIND[e.kind];
                  const row = (
                    <div className="flex gap-3">
                      <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', k.cls)}>
                        <k.icon className="h-4 w-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium">{e.title}</div>
                        {e.detail ? <div className="text-xs text-nexo-muted">{e.detail}</div> : null}
                        <div className="text-xs text-nexo-faint">{fmt(e.at)}</div>
                      </div>
                    </div>
                  );
                  return (
                    <li key={i}>
                      {e.link ? (
                        <Link href={e.link} className="block rounded-lg p-1 transition-colors hover:bg-nexo-bg">
                          {row}
                        </Link>
                      ) : (
                        <div className="p-1">{row}</div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
