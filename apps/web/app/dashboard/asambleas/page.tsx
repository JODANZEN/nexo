'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ASAMBLEA_STATUS } from '@/lib/asamblea-status';
import { cn } from '@/lib/utils';

interface Asamblea {
  id: string;
  title: string;
  type: string;
  scheduled_at: string;
  quorum_percentage: string;
  status: 'SCHEDULED' | 'QUORUM_OPEN' | 'IN_PROGRESS' | 'VOTING_CLOSED' | 'COMPLETED' | 'CANCELLED';
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AsambleasPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  const [open, setOpen] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['asambleas'],
    queryFn: () => api.get<Asamblea[]>('/asambleas'),
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Asamblea</h1>
          <p className="mt-1 text-sm text-nexo-muted">Asambleas y votaciones del conjunto.</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nueva Asamblea
          </Button>
        ) : null}
      </div>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-red-600">Error: {(error as Error).message}</div>
        ) : !data || data.length === 0 ? (
          <div className="p-10 text-center text-sm text-nexo-muted">No hay asambleas.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {data.map((a) => {
              const st = ASAMBLEA_STATUS[a.status];
              return (
                <li key={a.id}>
                  <Link
                    href={`/dashboard/asambleas/${a.id}`}
                    className="flex items-center justify-between gap-4 px-5 py-4 transition-colors hover:bg-nexo-bg"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{a.title}</div>
                      <div className="mt-0.5 text-xs text-nexo-muted">
                        {a.type} · {fmt(a.scheduled_at)} · quórum {Number(a.quorum_percentage)}%
                      </div>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>
                      {st.label}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {isAdmin ? (
        <CreateDialog
          open={open}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            qc.invalidateQueries({ queryKey: ['asambleas'] });
          }}
        />
      ) : null}
    </div>
  );
}

function CreateDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const api = useApi();
  const [title, setTitle] = useState('');
  const [type, setType] = useState('ORDINARIA');
  const [scheduledAt, setScheduledAt] = useState('');
  const [quorum, setQuorum] = useState('51');

  const create = useMutation({
    mutationFn: () =>
      api.post('/asambleas', {
        title: title.trim(),
        type,
        scheduledAt: new Date(scheduledAt).toISOString(),
        quorumPercentage: Number(quorum),
      }),
    onSuccess: onCreated,
  });

  const fieldCls = 'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva Asamblea">
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={fieldCls} placeholder="Asamblea Ordinaria 2026" />
        </div>
        <div>
          <label className="text-sm font-medium">Tipo</label>
          <select value={type} onChange={(e) => setType(e.target.value)} className={fieldCls}>
            <option value="ORDINARIA">Ordinaria</option>
            <option value="EXTRAORDINARIA">Extraordinaria</option>
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Fecha y hora</label>
          <input type="datetime-local" value={scheduledAt} onChange={(e) => setScheduledAt(e.target.value)} className={fieldCls} />
        </div>
        <div>
          <label className="text-sm font-medium">Quórum (%)</label>
          <input type="number" min={0} max={100} value={quorum} onChange={(e) => setQuorum(e.target.value)} className={fieldCls} />
        </div>
        <Button
          className="w-full"
          disabled={!title.trim() || !scheduledAt || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Crear'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
