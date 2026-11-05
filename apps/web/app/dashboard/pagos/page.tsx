'use client';

import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import type { BillingSnapshot } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

type Phase = BillingSnapshot['billingPhase'];

const PHASE: Record<Phase, { row: string; badge: string; label: string }> = {
  PRONTO_PAGO: { row: 'bg-green-50', badge: 'bg-green-50 text-green-700', label: 'Pronto pago' },
  TARIFA_PLENA: { row: 'bg-yellow-50', badge: 'bg-yellow-50 text-yellow-700', label: 'Tarifa plena' },
  MORA: { row: 'bg-red-50', badge: 'bg-red-50 text-red-700', label: 'Mora' },
};

function cop(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`;
}

export default function PagosPage() {
  const api = useApi();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['billing', 'units'],
    queryFn: () => api.get<BillingSnapshot[]>('/billing/units'),
  });

  const pay = useMutation({
    mutationFn: (unit: BillingSnapshot) =>
      api.post<{ paymentLinkUrl: string }>('/payments/links/generate', {
        unitId: unit.unitId,
        chargeIds: unit.outstandingChargeIds,
        paymentMethod: 'PSE',
      }),
    onSuccess: (res) => window.open(res.paymentLinkUrl, '_blank', 'noopener,noreferrer'),
  });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
        <p className="mt-1 text-sm text-nexo-muted">
          Cartera del conjunto — estado de pago por unidad.
        </p>
      </div>

      {pay.isError ? (
        <p className="text-sm text-red-600">
          No se pudo generar el enlace de pago: {(pay.error as Error).message}
        </p>
      ) : null}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando cartera…
          </div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-red-600">
            Error al cargar la cartera: {(error as Error).message}
          </div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-nexo-muted">No hay unidades.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-nexo-border text-left text-xs uppercase tracking-wide text-nexo-muted">
                  <th className="px-4 py-3 font-medium">Unidad</th>
                  <th className="px-4 py-3 font-medium">Cuota base</th>
                  <th className="px-4 py-3 font-medium">Descuento</th>
                  <th className="px-4 py-3 font-medium">Mora</th>
                  <th className="px-4 py-3 font-medium">Total a pagar</th>
                  <th className="px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3 text-right font-medium">Acción</th>
                </tr>
              </thead>
              <tbody>
                {data.map((u) => {
                  const phase = PHASE[u.billingPhase];
                  const paying = pay.isPending && pay.variables?.unitId === u.unitId;
                  return (
                    <tr key={u.unitId} className={cn('border-b border-nexo-border last:border-0', phase.row)}>
                      <td className="px-4 py-3 font-medium">{u.unitNumber}</td>
                      <td className="px-4 py-3">{cop(u.baseAmount)}</td>
                      <td className="px-4 py-3 text-green-700">
                        {u.discountAmount > 0 ? `- ${cop(u.discountAmount)}` : '—'}
                      </td>
                      <td className="px-4 py-3 text-red-700">
                        {u.lateFeesAmount > 0 ? cop(u.lateFeesAmount) : '—'}
                      </td>
                      <td className="px-4 py-3 font-semibold">{cop(u.totalDue)}</td>
                      <td className="px-4 py-3">
                        <span className={cn('inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', phase.badge)}>
                          {phase.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          size="sm"
                          disabled={u.totalDue <= 0 || paying}
                          onClick={() => pay.mutate(u)}
                        >
                          {paying ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pagar'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
