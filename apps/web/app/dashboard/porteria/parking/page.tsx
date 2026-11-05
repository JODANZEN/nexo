'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cop } from '@/lib/status-badges';

export const dynamic = 'force-dynamic';

interface Session {
  id: string;
  spot_id: string;
  license_plate: string;
  visitor_name: string | null;
  unit_visited: string | null;
  entered_at: string;
  exited_at: string | null;
  amount_charged: string | null;
  spot?: { spot_number: string };
}
interface Spot {
  id: string;
  spot_number: string;
  spot_type: string;
}

const RATE_PER_HOUR = 3500; // display estimate; server is source of truth

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
}
function elapsed(fromIso: string): string {
  const mins = Math.floor((Date.now() - new Date(fromIso).getTime()) / 60000);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}
function costSoFar(fromIso: string): number {
  const hours = Math.max(1, Math.ceil((Date.now() - new Date(fromIso).getTime()) / 3_600_000));
  return hours * RATE_PER_HOUR;
}

export default function ParkingPage() {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  const sessions = useQuery({
    queryKey: ['parking', 'sessions'],
    queryFn: () => api.get<Session[]>('/parking/sessions'),
    refetchInterval: 30_000,
  });

  const exit = useMutation({
    mutationFn: (id: string) => api.patch(`/parking/sessions/${id}/exit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['parking'] }),
  });

  const active = (sessions.data ?? []).filter((s) => !s.exited_at);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parqueaderos</h1>
          <p className="text-sm text-nexo-muted">Sesiones de parqueo activas</p>
        </div>
        <Button variant="accent" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva entrada
        </Button>
      </div>

      <Card className="overflow-hidden">
        {sessions.isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : sessions.isError ? (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos. {(sessions.error as Error).message}
          </div>
        ) : active.length === 0 ? (
          <div className="p-8 text-center text-sm text-nexo-muted">Sin datos aún.</div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nexo-border text-left text-xs uppercase tracking-wide text-nexo-muted">
                <th className="px-5 py-3 font-medium">Celda</th>
                <th className="px-5 py-3 font-medium">Placa</th>
                <th className="px-5 py-3 font-medium">Entrada</th>
                <th className="px-5 py-3 font-medium">Tiempo</th>
                <th className="px-5 py-3 font-medium">Costo aprox.</th>
                <th className="px-5 py-3" />
              </tr>
            </thead>
            <tbody>
              {active.map((s) => (
                <tr key={s.id} className="border-b border-nexo-border last:border-0">
                  <td className="px-5 py-3 font-medium">{s.spot?.spot_number ?? '—'}</td>
                  <td className="px-5 py-3">{s.license_plate}</td>
                  <td className="px-5 py-3 text-nexo-muted">{fmtTime(s.entered_at)}</td>
                  <td className="px-5 py-3 text-nexo-muted">{elapsed(s.entered_at)}</td>
                  <td className="px-5 py-3">{cop(costSoFar(s.entered_at))}</td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={exit.isPending}
                      onClick={() => exit.mutate(s.id)}
                    >
                      Registrar salida
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
      {exit.isError ? <p className="text-sm text-red-600">{(exit.error as Error).message}</p> : null}

      <NewEntryDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewEntryDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [spotId, setSpotId] = useState('');
  const [plate, setPlate] = useState('');
  const [visitorName, setVisitorName] = useState('');
  const [unitVisited, setUnitVisited] = useState('');

  const spots = useQuery({
    queryKey: ['parking', 'available'],
    queryFn: () => api.get<Spot[]>('/parking/spots/available'),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () =>
      api.post('/parking/sessions/entry', {
        spotId,
        licensePlate: plate.trim(),
        visitorName: visitorName.trim() || undefined,
        unitVisited: unitVisited.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['parking'] });
      setSpotId('');
      setPlate('');
      setVisitorName('');
      setUnitVisited('');
      onClose();
    },
  });

  const fieldCls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva entrada">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Celda</label>
          <select value={spotId} onChange={(e) => setSpotId(e.target.value)} className={fieldCls}>
            <option value="">Selecciona una celda…</option>
            {(spots.data ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.spot_number} ({s.spot_type === 'VISITOR' ? 'Visitante' : 'Residente'})
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Placa</label>
          <input value={plate} onChange={(e) => setPlate(e.target.value)} placeholder="ABC123" className={fieldCls} />
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Visitante (opcional)</label>
          <input value={visitorName} onChange={(e) => setVisitorName(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Unidad visitada (opcional)</label>
          <input value={unitVisited} onChange={(e) => setUnitVisited(e.target.value)} className={fieldCls} />
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!spotId || !plate.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar entrada'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
