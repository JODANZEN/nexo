'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Plus, CalendarDays } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

interface Amenity {
  id: string;
  name: string;
  description: string | null;
  open_time: string | null;
  close_time: string | null;
}
interface Reservation {
  id: string;
  amenity_id: string;
  reserved_by_name: string | null;
  start_at: string;
  end_at: string;
  amenity?: { name: string };
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' });
}

export default function ReservasPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  const [reserveOpen, setReserveOpen] = useState(false);
  const [amenityOpen, setAmenityOpen] = useState(false);

  const amenities = useQuery({ queryKey: ['amenities'], queryFn: () => api.get<Amenity[]>('/reservas/amenities') });
  const reservations = useQuery({
    queryKey: ['reservas'],
    queryFn: () => api.get<Reservation[]>('/reservas'),
  });

  const cancel = useMutation({
    mutationFn: (id: string) => api.patch(`/reservas/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reservas'] }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reservas</h1>
          <p className="mt-1 text-sm text-nexo-muted">Reserva de zonas comunes.</p>
        </div>
        <div className="flex gap-2">
          {isAdmin ? (
            <Button variant="outline" onClick={() => setAmenityOpen(true)}>
              <Plus className="h-4 w-4" /> Zona común
            </Button>
          ) : null}
          <Button
            variant="accent"
            disabled={!amenities.data || amenities.data.length === 0}
            onClick={() => setReserveOpen(true)}
          >
            <Plus className="h-4 w-4" /> Nueva reserva
          </Button>
        </div>
      </div>

      {/* Amenities */}
      {amenities.isLoading ? (
        <Card className="p-5">
          <Skeleton rows={2} />
        </Card>
      ) : amenities.isError ? (
        <ErrorState error={amenities.error} />
      ) : !amenities.data || amenities.data.length === 0 ? (
        <Card>
          <EmptyState icon={<CalendarDays className="h-8 w-8 text-nexo-faint" />}>
            {isAdmin ? 'Crea una zona común para empezar.' : 'No hay zonas comunes configuradas.'}
          </EmptyState>
        </Card>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {amenities.data.map((a) => (
            <Card key={a.id} className="p-4">
              <div className="font-medium">{a.name}</div>
              {a.description ? <div className="mt-0.5 text-xs text-nexo-muted">{a.description}</div> : null}
              {a.open_time || a.close_time ? (
                <div className="mt-1 text-xs text-nexo-muted">
                  {a.open_time ?? '—'} – {a.close_time ?? '—'}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {/* Reservations */}
      <Card className="overflow-hidden">
        <div className="p-5 pb-2">
          <h2 className="text-base font-semibold tracking-tight">Próximas reservas</h2>
        </div>
        {reservations.isLoading ? (
          <div className="p-5">
            <Skeleton rows={3} />
          </div>
        ) : reservations.isError ? (
          <div className="m-5">
            <ErrorState error={reservations.error} />
          </div>
        ) : !reservations.data || reservations.data.length === 0 ? (
          <EmptyState>Sin reservas aún.</EmptyState>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {reservations.data.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 px-5 py-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium">{r.amenity?.name ?? 'Zona común'}</div>
                  <div className="text-xs text-nexo-muted">
                    {fmt(r.start_at)} → {fmt(r.end_at)}
                    {r.reserved_by_name ? ` · ${r.reserved_by_name}` : ''}
                  </div>
                </div>
                <Button size="sm" variant="outline" disabled={cancel.isPending} onClick={() => cancel.mutate(r.id)}>
                  Cancelar
                </Button>
              </li>
            ))}
          </ul>
        )}
        {cancel.isError ? (
          <p className="px-5 pb-3 text-sm text-red-600">{(cancel.error as Error).message}</p>
        ) : null}
      </Card>

      <NewReservationDialog open={reserveOpen} onClose={() => setReserveOpen(false)} amenities={amenities.data ?? []} />
      <NewAmenityDialog open={amenityOpen} onClose={() => setAmenityOpen(false)} />
    </div>
  );
}

function NewReservationDialog({
  open,
  onClose,
  amenities,
}: {
  open: boolean;
  onClose: () => void;
  amenities: Amenity[];
}) {
  const api = useApi();
  const qc = useQueryClient();
  const [amenityId, setAmenityId] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/reservas', {
        amenityId,
        startAt: new Date(start).toISOString(),
        endAt: new Date(end).toISOString(),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reservas'] });
      setAmenityId('');
      setStart('');
      setEnd('');
      onClose();
    },
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva reserva">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Zona común</label>
          <select value={amenityId} onChange={(e) => setAmenityId(e.target.value)} className={cls}>
            <option value="">Selecciona…</option>
            {amenities.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Desde</label>
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={cls} />
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Hasta</label>
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={cls} />
          </div>
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!amenityId || !start || !end || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Reservar'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}

function NewAmenityDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', description: '', openTime: '', closeTime: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/reservas/amenities', {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        openTime: form.openTime.trim() || undefined,
        closeTime: form.closeTime.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['amenities'] });
      setForm({ name: '', description: '', openTime: '', closeTime: '' });
      onClose();
    },
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva zona común">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Nombre</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Salón social"
            className={cls}
          />
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Descripción (opcional)</label>
          <input
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            className={cls}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Abre</label>
            <input type="time" value={form.openTime} onChange={(e) => setForm({ ...form, openTime: e.target.value })} className={cls} />
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Cierra</label>
            <input type="time" value={form.closeTime} onChange={(e) => setForm({ ...form, closeTime: e.target.value })} className={cls} />
          </div>
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!form.name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear zona'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
