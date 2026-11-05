'use client';

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, KeyRound, Loader2, X } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

export interface EntryAuth {
  id: string;
  pqrId: string;
  status: 'PENDING' | 'APPROVED' | 'DENIED' | 'EXPIRED' | 'USED' | 'CANCELLED';
  reason: string | null;
  windowStart: string;
  windowEnd: string;
  decidedAt: string | null;
  decisionNote: string | null;
  usedAt: string | null;
  createdAt: string;
}

export const ENTRY_STATUS: Record<EntryAuth['status'], { label: string; cls: string }> = {
  PENDING: { label: 'Esperando respuesta', cls: 'bg-purple-50 text-purple-700' },
  APPROVED: { label: 'Aprobada', cls: 'bg-green-50 text-green-700' },
  DENIED: { label: 'No autorizada', cls: 'bg-red-50 text-red-700' },
  EXPIRED: { label: 'Vencida', cls: 'bg-gray-100 text-gray-600' },
  USED: { label: 'Ingreso realizado', cls: 'bg-blue-50 text-blue-700' },
  CANCELLED: { label: 'Cancelada', cls: 'bg-gray-100 text-gray-600' },
};

export function formatWindow(startIso: string, endIso: string): string {
  const s = new Date(startIso);
  const e = new Date(endIso);
  // Always building time (Colombia), whatever the viewer's device says.
  const tz = 'America/Bogota';
  const day = (d: Date) => d.toLocaleDateString('es-CO', { timeZone: tz, weekday: 'short', day: 'numeric', month: 'short' });
  const time = (d: Date) => d.toLocaleTimeString('es-CO', { timeZone: tz, hour: 'numeric', minute: '2-digit' });
  return day(s) === day(e) ? `${day(s)}, ${time(s)} – ${time(e)}` : `${day(s)} ${time(s)} – ${day(e)} ${time(e)}`;
}

function apiMessage(err: unknown): string {
  const raw = (err as Error)?.message ?? 'Error';
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    return Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message ?? raw;
  } catch {
    return raw;
  }
}

// <input type="datetime-local"> wants local "YYYY-MM-DDTHH:mm".
function localInput(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Ops side (admin / assigned staff): request entry to the unit + history. */
export function EntryRequestPanel({ pqrId, disabled }: { pqrId: string; disabled?: boolean }) {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const list = useQuery({
    queryKey: ['entry-auth', pqrId],
    queryFn: () => api.get<EntryAuth[]>(`/pqrs/${pqrId}/entry-authorizations`),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`/entry-authorizations/${id}/cancel`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['entry-auth', pqrId] }),
  });
  const rows = list.data ?? [];

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <KeyRound className="h-4 w-4" /> Autorización de ingreso
          </h2>
          <p className="text-xs text-nexo-muted">
            El residente responde desde la app o desde un enlace por SMS/WhatsApp. Mientras tanto el tiempo se pausa.
          </p>
        </div>
        {!disabled ? (
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
            Pedir ingreso
          </Button>
        ) : null}
      </div>
      {rows.length ? (
        <ul className="mt-3 divide-y divide-nexo-border rounded-lg border border-nexo-border text-sm">
          {rows.map((r) => (
            <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <span className="font-medium">{formatWindow(r.windowStart, r.windowEnd)}</span>
                {r.reason ? <span className="ml-2 text-xs text-nexo-muted">{r.reason}</span> : null}
                {r.decisionNote ? <p className="text-xs text-nexo-muted">“{r.decisionNote}”</p> : null}
              </div>
              <div className="flex items-center gap-2">
                <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', ENTRY_STATUS[r.status].cls)}>
                  {ENTRY_STATUS[r.status].label}
                </span>
                {r.status === 'PENDING' || r.status === 'APPROVED' ? (
                  <button onClick={() => cancel.mutate(r.id)} className="text-xs text-nexo-faint hover:text-red-600">
                    Cancelar
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}
      {cancel.isError ? <p className="mt-2 text-xs text-red-600">{apiMessage(cancel.error)}</p> : null}
      {open ? <RequestDialog pqrId={pqrId} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function RequestDialog({ pqrId, onClose }: { pqrId: string; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const now = new Date();
  now.setMinutes(0, 0, 0);
  now.setHours(now.getHours() + 1);
  const [start, setStart] = useState(localInput(now));
  const [end, setEnd] = useState(localInput(new Date(now.getTime() + 2 * 3_600_000)));
  const [reason, setReason] = useState('');
  const send = useMutation({
    mutationFn: () =>
      api.post(`/pqrs/${pqrId}/entry-authorizations`, {
        windowStart: new Date(start).toISOString(),
        windowEnd: new Date(end).toISOString(),
        reason: reason.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['entry-auth', pqrId] });
      qc.invalidateQueries({ queryKey: ['pqr', pqrId] });
      qc.invalidateQueries({ queryKey: ['tarea', pqrId] });
      onClose();
    },
  });
  const cls =
    'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';
  return (
    <Dialog open onClose={onClose} title="Pedir autorización de ingreso">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Desde
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className={cls} />
          </label>
          <label className="block text-sm font-medium">
            Hasta
            <input type="datetime-local" value={end} onChange={(e) => setEnd(e.target.value)} className={cls} />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Motivo (lo ve el residente)
          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Revisar la fuga del baño" className={cls} />
        </label>
        <Button variant="accent" className="w-full" disabled={send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />} Enviar al residente
        </Button>
        {send.isError ? <p className="text-xs text-red-600">{apiMessage(send.error)}</p> : null}
      </div>
    </Dialog>
  );
}

/** Resident side (portal): approve / deny a pending request on their ticket. */
export function EntryDecisionPanel({ pqrId }: { pqrId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const [note, setNote] = useState('');
  const list = useQuery({
    queryKey: ['entry-auth', pqrId],
    queryFn: () => api.get<EntryAuth[]>(`/pqrs/${pqrId}/entry-authorizations`),
  });
  const decide = useMutation({
    mutationFn: (v: { id: string; approve: boolean }) =>
      api.post(`/entry-authorizations/${v.id}/decision`, { approve: v.approve, note: note.trim() || undefined }),
    onSuccess: () => {
      setNote('');
      qc.invalidateQueries({ queryKey: ['entry-auth', pqrId] });
      qc.invalidateQueries({ queryKey: ['pqr', pqrId] });
    },
  });
  const rows = list.data ?? [];
  const pending = rows.find((r) => r.status === 'PENDING');
  const latest = rows.find((r) => r.status !== 'CANCELLED');
  if (!pending && !latest) return null;

  if (!pending && latest) {
    return (
      <div className="rounded-xl border border-nexo-border bg-white p-4 text-sm">
        <p className="flex items-center gap-2 font-medium">
          <KeyRound className="h-4 w-4" /> Ingreso a tu unidad
        </p>
        <p className="mt-1 text-nexo-muted">
          {formatWindow(latest.windowStart, latest.windowEnd)} ·{' '}
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', ENTRY_STATUS[latest.status].cls)}>
            {ENTRY_STATUS[latest.status].label}
          </span>
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border-2 border-nexo-teal bg-white p-4">
      <p className="flex items-center gap-2 font-semibold">
        <KeyRound className="h-4 w-4 text-nexo-teal" /> ¿Autorizas el ingreso a tu unidad?
      </p>
      <p className="mt-1 text-sm">{formatWindow(pending!.windowStart, pending!.windowEnd)}</p>
      {pending!.reason ? <p className="text-sm text-nexo-muted">{pending!.reason}</p> : null}
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Nota opcional (ej. la llave está en recepción)"
        className="mt-3 h-10 w-full rounded-lg border border-nexo-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="outline" disabled={decide.isPending} onClick={() => decide.mutate({ id: pending!.id, approve: false })}>
          <X className="h-4 w-4" /> No autorizo
        </Button>
        <Button variant="accent" disabled={decide.isPending} onClick={() => decide.mutate({ id: pending!.id, approve: true })}>
          {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Autorizo
        </Button>
      </div>
      {decide.isError ? <p className="mt-2 text-xs text-red-600">{apiMessage(decide.error)}</p> : null}
    </div>
  );
}
