'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Check, KeyRound, Loader2, X } from 'lucide-react';
import { ApiError, publicRequest } from '@/lib/api';
import { NexoLogo } from '@/components/nexo-logo';
import { Button } from '@/components/ui/button';
import { ENTRY_STATUS, formatWindow, type EntryAuth } from '@/components/tickets/entry-authorization';

interface PublicEntry {
  conjunto: string;
  unitNumber: string;
  ticketTitle: string;
  reason: string | null;
  windowStart: string;
  windowEnd: string;
  status: EntryAuth['status'];
}

// One-time link sent by SMS/WhatsApp: the resident approves without signing in.
export default function AutorizarPage() {
  const { token } = useParams<{ token: string }>();
  const [note, setNote] = useState('');
  const q = useQuery({
    queryKey: ['public-entry', token],
    queryFn: () => publicRequest<PublicEntry>(`/entry-authorizations/${encodeURIComponent(token)}`),
    retry: false,
  });
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      publicRequest<PublicEntry>(`/entry-authorizations/${encodeURIComponent(token)}`, {
        method: 'POST',
        body: JSON.stringify({ approve, note: note.trim() || undefined }),
      }),
  });
  const data = decide.data ?? q.data;

  return (
    <div className="flex min-h-screen flex-col items-center bg-nexo-bg px-4 py-10">
      <div className="text-nexo-navy">
        <NexoLogo />
      </div>
      <div className="mt-8 w-full max-w-sm rounded-2xl border border-nexo-border bg-white p-6 shadow-sm">
        {q.isLoading ? (
          <div className="flex justify-center py-6 text-nexo-muted">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : q.isError || !data ? (
          <p className="text-center text-sm text-nexo-muted">
            {q.error instanceof ApiError && q.error.status === 404
              ? 'Este enlace no es válido.'
              : 'No pudimos cargar la solicitud. Intenta de nuevo en un momento.'}
          </p>
        ) : (
          <>
            <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-nexo-muted">
              <KeyRound className="h-4 w-4" /> {data.conjunto}
            </p>
            <h1 className="mt-2 text-lg font-bold tracking-tight">Ingreso a la unidad {data.unitNumber}</h1>
            <p className="mt-1 text-sm">{formatWindow(data.windowStart, data.windowEnd)}</p>
            <p className="mt-2 text-sm text-nexo-muted">
              Por tu solicitud “{data.ticketTitle}”{data.reason ? `: ${data.reason}` : ''}.
            </p>

            {data.status === 'PENDING' ? (
              <>
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="Nota opcional"
                  className="mt-4 h-11 w-full rounded-lg border border-nexo-border px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
                />
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button variant="outline" className="h-12" disabled={decide.isPending} onClick={() => decide.mutate(false)}>
                    <X className="h-4 w-4" /> No autorizo
                  </Button>
                  <Button variant="accent" className="h-12" disabled={decide.isPending} onClick={() => decide.mutate(true)}>
                    {decide.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Autorizo
                  </Button>
                </div>
              </>
            ) : (
              <p className={`mt-4 rounded-lg px-3 py-2 text-center text-sm font-medium ${ENTRY_STATUS[data.status].cls}`}>
                {decide.isSuccess ? '¡Listo! ' : ''}
                {ENTRY_STATUS[data.status].label}
              </p>
            )}
            {decide.isError ? (
              <p className="mt-2 text-center text-xs text-red-600">Esta solicitud ya fue respondida o venció.</p>
            ) : null}
          </>
        )}
      </div>
      <p className="mt-6 max-w-sm text-center text-xs text-nexo-faint">
        Solo quien recibió este enlace puede responder. No lo compartas.
      </p>
    </div>
  );
}
