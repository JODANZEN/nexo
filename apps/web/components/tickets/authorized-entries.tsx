'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { DoorOpen, Loader2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { formatWindow, type EntryAuth } from './entry-authorization';

interface ActiveEntry extends EntryAuth {
  unitNumber: string;
  ticketTitle: string;
  requestedBy: string;
  assignee: string | null;
}

/** Portería: entries residents approved for now / the next 24 h, marked when they happen. */
export function AuthorizedEntriesCard() {
  const api = useApi();
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['entry-auth', 'active'],
    queryFn: () => api.get<ActiveEntry[]>('/entry-authorizations/active'),
    refetchInterval: 60_000,
  });
  const markUsed = useMutation({
    mutationFn: (id: string) => api.post(`/entry-authorizations/${id}/use`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entry-auth', 'active'] }),
  });
  const rows = q.data ?? [];
  const now = Date.now();

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <DoorOpen className="h-4 w-4" /> Ingresos autorizados a unidades
      </h2>
      <p className="text-xs text-nexo-muted">Personal de mantenimiento con permiso del residente, hoy y mañana.</p>
      {q.isLoading ? (
        <div className="mt-3 h-8 animate-pulse rounded bg-nexo-border" />
      ) : rows.length === 0 ? (
        <p className="mt-3 text-sm text-nexo-muted">No hay ingresos autorizados por ahora.</p>
      ) : (
        <ul className="mt-3 divide-y divide-nexo-border rounded-lg border border-nexo-border text-sm">
          {rows.map((r) => {
            const open = now >= new Date(r.windowStart).getTime() - 15 * 60_000;
            return (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                <div className="min-w-0">
                  <span className="font-medium">Unidad {r.unitNumber}</span>
                  <span className="ml-2 text-xs text-nexo-muted">{formatWindow(r.windowStart, r.windowEnd)}</span>
                  <p className="text-xs text-nexo-muted">
                    {r.assignee ?? r.requestedBy} · {r.ticketTitle}
                  </p>
                </div>
                <Button size="sm" variant={open ? 'accent' : 'outline'} disabled={!open || markUsed.isPending} onClick={() => markUsed.mutate(r.id)}>
                  {markUsed.isPending && markUsed.variables === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {open ? 'Registrar ingreso' : 'Aún no'}
                </Button>
              </li>
            );
          })}
        </ul>
      )}
      {markUsed.isError ? <p className="mt-2 text-xs text-red-600">{(markUsed.error as Error).message}</p> : null}
    </Card>
  );
}
