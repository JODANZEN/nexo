'use client';

import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Plus, QrCode as QrIcon, X } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

interface VisitorQr {
  id: string;
  visitor_name: string;
  valid_from: string;
  valid_until: string;
  qr_token: string;
  status: string;
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function PortalVisitas() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const unitId = user?.publicMetadata?.unitId as string | undefined;
  const [formOpen, setFormOpen] = useState(false);
  const [active, setActive] = useState<{ token: string; name: string } | null>(null);

  const list = useQuery({ queryKey: ['visitor-qr'], queryFn: () => api.get<VisitorQr[]>('/visitors/qr') });

  // A resident not yet linked to a unit can't pre-authorize visitors.
  if (!unitId) {
    return (
      <div className="space-y-5">
        <h1 className="text-xl font-bold tracking-tight">Visitas</h1>
        <Card className="p-6 text-center text-sm text-nexo-muted">
          Tu unidad aún no está configurada. Contacta al administrador.
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Visitas</h1>
        <Button variant="accent" size="sm" onClick={() => setFormOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva
        </Button>
      </div>

      <Card className="overflow-hidden">
        {list.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : list.isError ? (
          <div className="m-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos. {(list.error as Error).message}
          </div>
        ) : !list.data || list.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-nexo-muted">No tienes visitas registradas.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {list.data.map((qr) => (
              <li key={qr.id}>
                <button
                  onClick={() => setActive({ token: qr.qr_token, name: qr.visitor_name })}
                  className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-nexo-bg"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-nexo-teal/15 text-nexo-teal">
                    <QrIcon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{qr.visitor_name}</div>
                    <div className="text-xs text-nexo-muted">
                      {fmt(qr.valid_from)} → {fmt(qr.valid_until)}
                    </div>
                  </div>
                  <span className="text-xs text-nexo-muted">{qr.status === 'PRE_AUTHORIZED' ? 'Activo' : 'Usado'}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <NewVisitDialog
        open={formOpen}
        unitId={unitId}
        onClose={() => setFormOpen(false)}
        onCreated={(token, name) => {
          qc.invalidateQueries({ queryKey: ['visitor-qr'] });
          setFormOpen(false);
          setActive({ token, name });
        }}
      />

      {active ? <QrOverlay token={active.token} name={active.name} onClose={() => setActive(null)} /> : null}
    </div>
  );
}

function NewVisitDialog({
  open,
  unitId,
  onClose,
  onCreated,
}: {
  open: boolean;
  unitId?: string;
  onClose: () => void;
  onCreated: (token: string, name: string) => void;
}) {
  const api = useApi();
  const [name, setName] = useState('');
  const [from, setFrom] = useState('');
  const [until, setUntil] = useState('');

  const gen = useMutation({
    mutationFn: () =>
      api.post<{ qrToken: string }>('/visitors/qr', {
        visitorName: name.trim(),
        validFrom: new Date(from).toISOString(),
        validUntil: new Date(until).toISOString(),
        unitId,
      }),
    onSuccess: (r) => onCreated(r.qrToken, name.trim()),
  });

  const fieldCls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva visita">
      <div className="space-y-3">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre del visitante" className={fieldCls} />
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
          disabled={!name.trim() || !from || !until || gen.isPending}
          onClick={() => gen.mutate()}
        >
          {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Generar QR'}
        </Button>
        {gen.isError ? <p className="text-xs text-red-600">{(gen.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}

function QrOverlay({ token, name, onClose }: { token: string; name: string; onClose: () => void }) {
  const [img, setImg] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(token, { width: 280, margin: 1 }).then(setImg).catch(() => setImg(null));
  }, [token]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-5 bg-nexo-navy p-6 text-white">
      <button onClick={onClose} className="absolute right-4 top-4 text-white/70" aria-label="Cerrar">
        <X className="h-6 w-6" />
      </button>
      <div className="text-lg font-semibold">{name}</div>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="QR de visita" className="rounded-2xl bg-white p-4" />
      ) : (
        <Loader2 className="h-6 w-6 animate-spin" />
      )}
      <p className="text-sm text-white/70">Muestra este código en portería</p>
    </div>
  );
}
