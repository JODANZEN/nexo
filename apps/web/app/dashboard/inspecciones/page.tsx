'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Loader2, Plus, ClipboardCheck } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';
import { TYPE_LABEL, STATUS } from '@/lib/inspection-labels';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Unit {
  id: string;
  unit_number: string;
}
interface Inspection {
  id: string;
  unit_id: string;
  type: 'MOVE_IN' | 'MOVE_OUT' | 'ROUTINE';
  status: 'DRAFT' | 'SUBMITTED' | 'ADMIN_REVIEWED';
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function InspeccionesPage() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const list = useQuery({ queryKey: ['inspections'], queryFn: () => api.get<Inspection[]>('/inspections') });
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const unitNumber = (id: string) => units.data?.find((u) => u.id === id)?.unit_number ?? '—';

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inspecciones</h1>
          <p className="mt-1 text-sm text-nexo-muted">Actas de entrada y salida con estado por habitación.</p>
        </div>
        <Button onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Nueva inspección
        </Button>
      </div>

      {list.isLoading ? (
        <Card className="p-5">
          <Skeleton rows={4} />
        </Card>
      ) : list.isError ? (
        <ErrorState error={list.error} />
      ) : !list.data || list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardCheck className="h-8 w-8 text-nexo-faint" />}>Sin inspecciones aún.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-nexo-border">
            {list.data.map((i) => (
              <li key={i.id}>
                <Link
                  href={`/dashboard/inspecciones/${i.id}`}
                  className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-nexo-bg"
                >
                  <div>
                    <div className="font-medium">Apto {unitNumber(i.unit_id)}</div>
                    <div className="mt-0.5 text-xs text-nexo-muted">
                      {TYPE_LABEL[i.type]} · {fmtDate(i.created_at)}
                    </div>
                  </div>
                  <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', STATUS[i.status].badge)}>
                    {STATUS[i.status].label}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <NewInspectionDialog open={open} onClose={() => setOpen(false)} units={units.data ?? []} />
    </div>
  );
}

function NewInspectionDialog({ open, onClose, units }: { open: boolean; onClose: () => void; units: Unit[] }) {
  const api = useApi();
  const router = useRouter();
  const [unitId, setUnitId] = useState('');
  const [type, setType] = useState<'MOVE_IN' | 'MOVE_OUT' | 'ROUTINE'>('MOVE_IN');

  const create = useMutation({
    mutationFn: () => api.post<Inspection>('/inspections', { unitId, type }),
    onSuccess: (insp) => {
      onClose();
      router.push(`/dashboard/inspecciones/${insp.id}`);
    },
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva inspección">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Unidad</label>
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={cls}>
            <option value="">Selecciona…</option>
            {units.map((u) => (
              <option key={u.id} value={u.id}>{u.unit_number}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value as typeof type)} className={cls}>
            <option value="MOVE_IN">Entrada</option>
            <option value="MOVE_OUT">Salida</option>
            <option value="ROUTINE">Rutina</option>
          </select>
        </div>
        <Button variant="accent" className="w-full" disabled={!unitId || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
