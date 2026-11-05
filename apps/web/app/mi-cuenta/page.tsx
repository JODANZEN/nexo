'use client';

import { useState } from 'react';
import QRCode from 'qrcode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser, UserButton } from '@clerk/nextjs';
import { Loader2, FileText, ExternalLink } from 'lucide-react';
import type { BillingSnapshot } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NexoLogo } from '@/components/nexo-logo';
import { cn } from '@/lib/utils';

const PHASE: Record<BillingSnapshot['billingPhase'], { label: string; badge: string }> = {
  PRONTO_PAGO: { label: 'Pronto pago', badge: 'bg-green-50 text-green-700' },
  TARIFA_PLENA: { label: 'Al día', badge: 'bg-yellow-50 text-yellow-700' },
  MORA: { label: 'En mora', badge: 'bg-red-50 text-red-700' },
};
const CATEGORIES = [
  ['MAINTENANCE', 'Mantenimiento'],
  ['NOISE', 'Ruido'],
  ['SECURITY', 'Seguridad'],
  ['FINANCIAL', 'Financiero'],
  ['COEXISTENCE', 'Convivencia'],
  ['OTHER', 'Otro'],
] as const;

function cop(n: number): string {
  return `$ ${n.toLocaleString('es-CO')}`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function MiCuentaPage() {
  const { user } = useUser();
  const unitId = user?.publicMetadata?.unitId as string | undefined;

  return (
    <div className="min-h-screen bg-nexo-bg pb-12">
      <header className="sticky top-0 z-10 flex items-center justify-between border-b border-nexo-border bg-white px-4 py-3">
        <span className="text-nexo-navy">
          <NexoLogo />
        </span>
        <UserButton afterSignOutUrl="/sign-in" />
      </header>

      <main className="mx-auto max-w-md space-y-4 p-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Mi cuenta</h1>
          <p className="text-sm text-nexo-muted">Hola, {user?.firstName ?? ''} 👋</p>
        </div>

        {!unitId ? (
          <Card className="p-5 text-sm text-nexo-muted">
            Tu usuario no tiene una unidad asignada todavía.
          </Card>
        ) : (
          <>
            <BalanceCard unitId={unitId} />
            <MyDocuments />
            <NewPqr />
            <VisitorQr />
          </>
        )}
      </main>
    </div>
  );
}

function BalanceCard({ unitId }: { unitId: string }) {
  const api = useApi();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['balance', unitId],
    queryFn: () => api.get<BillingSnapshot>(`/billing/units/${unitId}/balance`),
  });
  const pay = useMutation({
    mutationFn: () =>
      api.post<{ paymentLinkUrl: string }>('/payments/links/generate', {
        unitId,
        chargeIds: data?.outstandingChargeIds,
        paymentMethod: 'PSE',
      }),
    onSuccess: (res) => window.open(res.paymentLinkUrl, '_blank', 'noopener,noreferrer'),
  });

  if (isLoading) return <Card className="p-5 text-sm text-nexo-muted">Cargando saldo…</Card>;
  if (isError || !data) return <Card className="p-5 text-sm text-red-600">No se pudo cargar el saldo.</Card>;

  const phase = PHASE[data.billingPhase];
  return (
    <Card className="overflow-hidden">
      <div className="bg-gradient-to-br from-nexo-navy to-nexo-navyLight p-5 text-white">
        <div className="flex items-center justify-between">
          <span className="text-sm text-white/70">Total a pagar</span>
          <span className={cn('rounded-full px-2.5 py-0.5 text-xs font-medium', phase.badge)}>{phase.label}</span>
        </div>
        <div className="mt-1 text-3xl font-bold">{cop(data.totalDue)}</div>
        <div className="mt-1 text-sm text-white/70">
          {data.totalDue > 0 ? `Vence el ${fmtDate(data.dueDate)}` : 'Sin saldo pendiente'}
        </div>
      </div>
      <div className="p-4">
        <Button className="w-full" disabled={data.totalDue <= 0 || pay.isPending} onClick={() => pay.mutate()}>
          {pay.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Pagar ahora'}
        </Button>
        {pay.isError ? <p className="mt-2 text-xs text-red-600">{(pay.error as Error).message}</p> : null}
      </div>
    </Card>
  );
}

interface DocItem {
  documentId: string;
  title: string;
  createdAt: string;
}
function MyDocuments() {
  const api = useApi();
  const { data, isLoading } = useQuery({ queryKey: ['documents'], queryFn: () => api.get<DocItem[]>('/documents') });
  const ver = useMutation({
    mutationFn: (id: string) => api.get<{ url: string }>(`/documents/${id}/url`),
    onSuccess: (res) => window.open(res.url, '_blank', 'noopener,noreferrer'),
  });

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">Mis documentos</h2>
      {isLoading ? (
        <p className="mt-3 text-sm text-nexo-muted">Cargando…</p>
      ) : !data || data.length === 0 ? (
        <p className="mt-3 text-sm text-nexo-muted">No hay documentos.</p>
      ) : (
        <ul className="mt-3 divide-y divide-nexo-border">
          {data.map((d) => (
            <li key={d.documentId} className="flex items-center gap-3 py-2.5">
              <FileText className="h-4 w-4 text-nexo-navy" />
              <span className="min-w-0 flex-1 truncate text-sm">{d.title}</span>
              <button
                onClick={() => ver.mutate(d.documentId)}
                className="flex items-center gap-1 text-sm font-medium text-nexo-navy hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" /> Ver
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function NewPqr() {
  const api = useApi();
  const qc = useQueryClient();
  const [category, setCategory] = useState('MAINTENANCE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () => api.post('/pqrs', { category, title: title.trim(), description: description.trim() }),
    onSuccess: () => {
      setTitle('');
      setDescription('');
      qc.invalidateQueries({ queryKey: ['pqrs'] });
    },
  });

  const fieldCls = 'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">Nueva solicitud</h2>
      <div className="mt-3 space-y-3">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls}>
          {CATEGORIES.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Asunto" className={fieldCls} />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe tu solicitud…"
          className={fieldCls}
        />
        <Button
          className="w-full"
          disabled={!title.trim() || !description.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar solicitud'}
        </Button>
        {create.isSuccess ? <p className="text-xs text-green-600">Solicitud enviada.</p> : null}
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Card>
  );
}

function VisitorQr() {
  const api = useApi();
  const [visitorName, setVisitorName] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');
  const [qrImg, setQrImg] = useState<string | null>(null);

  const { user } = useUser();
  const unitId = user?.publicMetadata?.unitId as string | undefined;

  const gen = useMutation({
    mutationFn: () =>
      api.post<{ qrToken: string }>('/visitors/qr', {
        visitorName: visitorName.trim(),
        validFrom: new Date(from).toISOString(),
        validUntil: new Date(until).toISOString(),
        unitId,
      }),
    onSuccess: async (res) => {
      setQrImg(await QRCode.toDataURL(res.qrToken, { width: 220, margin: 1 }));
    },
  });

  const fieldCls = 'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">Generar QR de visitante</h2>
      <div className="mt-3 space-y-3">
        <input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} placeholder="Nombre del visitante" className={fieldCls} />
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Desde</label>
            <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={fieldCls} />
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Hasta</label>
            <input type="datetime-local" value={until} onChange={(e) => setUntil(e.target.value)} className={fieldCls} />
          </div>
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!visitorName.trim() || !from || !until || gen.isPending}
          onClick={() => gen.mutate()}
        >
          {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar QR'}
        </Button>
        {gen.isError ? <p className="text-xs text-red-600">{(gen.error as Error).message}</p> : null}
        {qrImg ? (
          <div className="flex flex-col items-center gap-2 pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrImg} alt="QR del visitante" className="rounded-lg border border-nexo-border" />
            <p className="text-xs text-nexo-muted">Muéstralo en portería</p>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
