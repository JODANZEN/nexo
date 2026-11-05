'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Repeat } from 'lucide-react';
import type { BillingSnapshot } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { BILLING_PHASE, PAYMENT_STATUS, cop } from '@/lib/status-badges';
import { cn } from '@/lib/utils';

interface Payment {
  id: string;
  amount: number;
  method: string;
  status: string;
  createdAt: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PortalPagos() {
  const api = useApi();
  const { user } = useUser();
  const unitId = user?.publicMetadata?.unitId as string | undefined;

  const balance = useQuery({
    queryKey: ['balance', unitId],
    queryFn: () => api.get<BillingSnapshot>(`/billing/units/${unitId}/balance`),
    enabled: !!unitId,
  });
  const history = useQuery({ queryKey: ['payments'], queryFn: () => api.get<Payment[]>('/payments') });

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

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Pagos</h1>

      <Card className="p-5 text-center">
        <div className="text-sm text-nexo-muted">Saldo actual</div>
        <div className="mt-1 text-4xl font-bold">{b ? cop(b.totalDue) : balance.isLoading ? '…' : '—'}</div>
        {phase ? (
          <span className={cn('mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium', phase.badge)}>
            {phase.label}
          </span>
        ) : null}
        {b && b.totalDue > 0 ? (
          <div className="mt-1 text-xs text-nexo-muted">Vence el {fmtDate(b.dueDate)}</div>
        ) : null}
        <Button
          variant="accent"
          className="mt-4 w-full"
          disabled={!b || b.totalDue <= 0 || pay.isPending}
          onClick={() => pay.mutate()}
        >
          {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pagar'}
        </Button>
        {pay.isError ? <p className="mt-2 text-xs text-red-600">{(pay.error as Error).message}</p> : null}
      </Card>

      {unitId ? <AutoPaySection unitId={unitId} /> : null}

      <Card className="overflow-hidden">
        <div className="p-5 pb-2">
          <h2 className="text-base font-semibold tracking-tight">Historial de pagos</h2>
        </div>
        {history.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-6 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : history.isError ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos. {(history.error as Error).message}
          </div>
        ) : !history.data || history.data.length === 0 ? (
          <div className="p-6 text-center text-sm text-nexo-muted">Aún no hay pagos.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {history.data.map((p) => {
              const st = PAYMENT_STATUS[p.status] ?? { label: p.status, badge: 'bg-gray-100 text-gray-600' };
              return (
                <li key={p.id} className="flex items-center justify-between gap-3 px-5 py-3">
                  <div>
                    <div className="text-sm font-medium">{cop(p.amount)}</div>
                    <div className="text-xs text-nexo-muted">
                      {p.method} · {fmtDate(p.createdAt)}
                    </div>
                  </div>
                  <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>{st.label}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

interface Mandate {
  id: string;
  status: string;
  paymentMethod: string;
}

const METHOD_LABEL: Record<string, string> = { CARD: 'Tarjeta', NEQUI: 'Nequi', PSE: 'PSE' };

function AutoPaySection({ unitId }: { unitId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'CARD' | 'NEQUI'>('CARD');

  const mandate = useQuery({
    queryKey: ['recurring', unitId],
    queryFn: () => api.get<Mandate | null>(`/payments/recurring/status?unitId=${unitId}`),
  });

  const enroll = useMutation({
    mutationFn: () => api.post('/payments/recurring/enroll', { unitId, paymentMethod: method }),
    onSuccess: () => {
      setOpen(false);
      qc.invalidateQueries({ queryKey: ['recurring', unitId] });
    },
  });

  const cancel = useMutation({
    mutationFn: () => api.del(`/payments/recurring/cancel?unitId=${unitId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['recurring', unitId] }),
  });

  const active = mandate.data;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-nexo-teal" />
        <h2 className="text-base font-semibold tracking-tight">Pago automático</h2>
      </div>

      {mandate.isLoading ? (
        <div className="mt-3 flex items-center gap-2 text-sm text-nexo-muted">
          <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
        </div>
      ) : active ? (
        <div className="mt-3 flex items-center justify-between">
          <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-medium text-green-700">
            Activo · {METHOD_LABEL[active.paymentMethod] ?? active.paymentMethod}
          </span>
          <button
            onClick={() => cancel.mutate()}
            disabled={cancel.isPending}
            className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            {cancel.isPending ? 'Cancelando…' : 'Cancelar'}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-2 text-sm text-nexo-muted">
            Guarda un método de pago y cobramos tu cuota automáticamente el día 1 de cada mes.
          </p>
          <Button variant="accent" className="mt-3 w-full" onClick={() => setOpen(true)}>
            Activar pago automático
          </Button>
        </>
      )}
      {cancel.isError ? (
        <p className="mt-2 text-xs text-red-600">{(cancel.error as Error).message}</p>
      ) : null}

      <Dialog open={open} onClose={() => setOpen(false)} title="Activar pago automático">
        <div className="space-y-3">
          <p className="text-sm text-nexo-muted">Selecciona el método de pago:</p>
          <div className="grid grid-cols-2 gap-2">
            {(['CARD', 'NEQUI'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMethod(m)}
                className={cn(
                  'rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
                  method === m
                    ? 'border-nexo-teal bg-nexo-teal/10 text-nexo-teal'
                    : 'border-nexo-border text-nexo-text hover:bg-nexo-bg',
                )}
              >
                {METHOD_LABEL[m]}
              </button>
            ))}
          </div>
          <Button
            variant="accent"
            className="w-full"
            disabled={enroll.isPending}
            onClick={() => enroll.mutate()}
          >
            {enroll.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Continuar'}
          </Button>
          {enroll.isError ? (
            <p className="text-xs text-red-600">{(enroll.error as Error).message}</p>
          ) : null}
        </div>
      </Dialog>
    </Card>
  );
}
