'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, QrCode, UserPlus, Package, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useApi, ApiError } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const dynamic = 'force-dynamic';

interface Unit {
  id: string;
  unit_number: string;
}
interface ScanResult {
  unitId: string;
  unitNumber: string | null;
  visitorName: string;
  residentName: string;
}

const SCAN_REASON: Record<string, string> = {
  ALREADY_USED: 'Este QR ya fue utilizado.',
  REVOKED: 'Este QR fue revocado.',
  EXPIRED: 'QR expirado o fuera del horario autorizado.',
};

function parseApiError(err: unknown): string {
  if (err instanceof ApiError) {
    try {
      const body = JSON.parse(err.message) as { message?: string; reason?: string };
      if (body.reason && SCAN_REASON[body.reason]) return SCAN_REASON[body.reason];
      return body.message ?? err.message;
    } catch {
      return err.message;
    }
  }
  return err instanceof Error ? err.message : 'Error';
}

const fieldCls =
  'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

export default function PorteriaPage() {
  const api = useApi();
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Portería</h1>
        <p className="mt-1 text-sm text-nexo-muted">Control de ingreso de visitantes y entregas.</p>
      </div>

      <QrCheckIn />
      <WalkIn units={units.data ?? []} />
      <DeliveryLog units={units.data ?? []} />
    </div>
  );
}

function QrCheckIn() {
  const api = useApi();
  const [token, setToken] = useState('');

  const scan = useMutation({
    mutationFn: (qrToken: string) => api.post<ScanResult>('/visitors/scan', { qrToken: qrToken.trim() }),
    onSuccess: () => setToken(''),
  });

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-teal/15 text-nexo-teal">
          <QrCode className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight">Registrar ingreso (QR)</h2>
          <p className="text-xs text-nexo-muted">Pega o escribe el código del QR del visitante.</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Código QR…"
          className={`${fieldCls} mt-0 flex-1 font-mono`}
          onKeyDown={(e) => e.key === 'Enter' && token.trim() && !scan.isPending && scan.mutate(token)}
        />
        <Button variant="accent" disabled={!token.trim() || scan.isPending} onClick={() => scan.mutate(token)}>
          {scan.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Validar'}
        </Button>
      </div>

      {/* ponytail: manual token entry is the MVP; camera scanning needs html5-qrcode
          (decode QR → setToken). Add when guards have tablet cameras in the field. */}

      {scan.isSuccess && scan.data ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-green-200 bg-green-50 p-4">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
          <div className="text-sm">
            <div className="font-semibold text-green-800">Ingreso autorizado</div>
            <div className="text-green-700">
              {scan.data.visitorName} → Apto {scan.data.unitNumber ?? '—'} · {scan.data.residentName}
            </div>
          </div>
        </div>
      ) : null}
      {scan.isError ? (
        <div className="mt-4 flex items-start gap-3 rounded-lg border border-red-200 bg-red-50 p-4">
          <ShieldAlert className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
          <div className="text-sm text-red-700">{parseApiError(scan.error)}</div>
        </div>
      ) : null}
    </Card>
  );
}

function WalkIn({ units }: { units: Unit[] }) {
  const api = useApi();
  const [form, setForm] = useState({ visitorName: '', cedulaRaw: '', destinationUnitId: '' });
  const [habeas, setHabeas] = useState(false);

  const walkin = useMutation({
    mutationFn: () =>
      api.post('/visitors/walkin', {
        visitorName: form.visitorName.trim(),
        cedulaRaw: form.cedulaRaw.trim(),
        destinationUnitId: form.destinationUnitId,
        habeasDataAccepted: habeas,
      }),
    onSuccess: () => {
      setForm({ visitorName: '', cedulaRaw: '', destinationUnitId: '' });
      setHabeas(false);
    },
  });

  const ready = form.visitorName.trim() && form.cedulaRaw.trim() && form.destinationUnitId && habeas;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
          <UserPlus className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight">Visitante sin registro</h2>
          <p className="text-xs text-nexo-muted">Ingreso manual con consentimiento de datos.</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Nombre del visitante</label>
          <input value={form.visitorName} onChange={(e) => setForm({ ...form, visitorName: e.target.value })} className={fieldCls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Cédula</label>
            <input value={form.cedulaRaw} onChange={(e) => setForm({ ...form, cedulaRaw: e.target.value })} className={fieldCls} />
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Apartamento</label>
            <select value={form.destinationUnitId} onChange={(e) => setForm({ ...form, destinationUnitId: e.target.value })} className={fieldCls}>
              <option value="">Selecciona…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.unit_number}</option>
              ))}
            </select>
          </div>
        </div>
        <label className="flex items-start gap-2 rounded-lg bg-nexo-bg p-3 text-xs text-nexo-muted">
          <input type="checkbox" checked={habeas} onChange={(e) => setHabeas(e.target.checked)} className="mt-0.5" />
          <span>
            El visitante autoriza el tratamiento de sus datos personales (Ley 1581/2012). La cédula se
            almacena cifrada.
          </span>
        </label>
        <Button variant="accent" className="w-full" disabled={!ready || walkin.isPending} onClick={() => walkin.mutate()}>
          {walkin.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar ingreso'}
        </Button>
        {walkin.isSuccess ? <p className="text-sm text-green-600">✓ Visitante registrado y notificado.</p> : null}
        {walkin.isError ? <p className="text-sm text-red-600">{parseApiError(walkin.error)}</p> : null}
      </div>
    </Card>
  );
}

function DeliveryLog({ units }: { units: Unit[] }) {
  const api = useApi();
  const [form, setForm] = useState({ unitId: '', carrier: '', description: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/deliveries', {
        unitId: form.unitId,
        carrier: form.carrier.trim(),
        description: form.description.trim() || undefined,
      }),
    onSuccess: () => setForm({ unitId: '', carrier: '', description: '' }),
  });

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-nexo-bg text-nexo-navy">
          <Package className="h-5 w-5" />
        </span>
        <div>
          <h2 className="font-semibold tracking-tight">Registrar entrega</h2>
          <p className="text-xs text-nexo-muted">El residente recibe notificación del paquete.</p>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Apartamento</label>
            <select value={form.unitId} onChange={(e) => setForm({ ...form, unitId: e.target.value })} className={fieldCls}>
              <option value="">Selecciona…</option>
              {units.map((u) => (
                <option key={u.id} value={u.id}>{u.unit_number}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Transportadora</label>
            <select value={form.carrier} onChange={(e) => setForm({ ...form, carrier: e.target.value })} className={fieldCls}>
              <option value="">Selecciona…</option>
              {['Rappi', 'MercadoLibre', 'Servientrega', 'Coordinadora', 'Otro'].map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Guía / descripción (opcional)</label>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={fieldCls} />
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!form.unitId || !form.carrier || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar entrega'}
        </Button>
        {create.isSuccess ? <p className="text-sm text-green-600">✓ Entrega registrada.</p> : null}
        {create.isError ? <p className="text-sm text-red-600">{parseApiError(create.error)}</p> : null}
      </div>
    </Card>
  );
}
