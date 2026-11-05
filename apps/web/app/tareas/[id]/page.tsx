'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, Lock, MapPin, PauseCircle, PlayCircle } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { PQR_CATEGORY, PQR_STATUS } from '@/lib/status-badges';
import { PRIORITY, slaState } from '@/lib/ticket-labels';
import { EntryRequestPanel } from '@/components/tickets/entry-authorization';
import { cn } from '@/lib/utils';
import { where, type Tarea } from '@/lib/tareas';

interface Detail extends Tarea {
  description: string;
  category: string;
  comments: { id: string; body: string; is_internal: boolean; created_at: string }[];
  attachmentUrls?: string[];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
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

export default function TareaPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);
  const q = useQuery({ queryKey: ['tarea', id], queryFn: () => api.get<Detail>(`/pqrs/${id}`) });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['tarea', id] });
    qc.invalidateQueries({ queryKey: ['tareas'] });
  };
  const status = useMutation({
    mutationFn: (s: string) => api.patch(`/pqrs/${id}/status`, { status: s }),
    onSuccess: refresh,
  });
  const comment = useMutation({
    mutationFn: () => api.post(`/pqrs/${id}/comments`, { body: body.trim(), isInternal: internal }),
    onSuccess: () => {
      setBody('');
      setInternal(false);
      refresh();
    },
  });

  if (q.isLoading) return <Skeleton rows={5} />;
  if (q.isError || !q.data) return <ErrorState error={q.error} />;
  const t = q.data;
  const sla = slaState(t);
  const st = PQR_STATUS[t.status];
  const done = t.status === 'RESOLVED' || t.status === 'CLOSED';

  return (
    <div className="space-y-4">
      <a href="/tareas" className="text-sm text-nexo-muted">
        ← Mis tareas
      </a>
      <Card className="p-5">
        <div className="flex items-center gap-2">
          <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PRIORITY[t.priority]?.badge)}>
            {PRIORITY[t.priority]?.label ?? t.priority}
          </span>
          <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium', st?.badge)}>{st?.label}</span>
        </div>
        <h1 className="mt-2 text-lg font-bold tracking-tight">{t.title}</h1>
        <p className="mt-1 flex items-center gap-1 text-sm font-medium">
          <MapPin className="h-4 w-4 text-nexo-teal" /> {where(t)}
        </p>
        <p className="text-xs text-nexo-muted">
          {PQR_CATEGORY[t.category] ?? t.category} · {fmt(t.created_at)}
          {sla.text ? <span className={cn('ml-2', sla.cls)}>{sla.text}</span> : null}
        </p>
        <p className="mt-3 whitespace-pre-line text-sm">{t.description}</p>
        {t.attachmentUrls?.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {t.attachmentUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1}`} className="h-20 w-20 rounded-lg border object-cover" />
              </a>
            ))}
          </div>
        ) : null}
      </Card>

      {!done ? (
        <div className="grid gap-2">
          {t.status === 'OPEN' ? (
            <Button variant="accent" className="h-12 text-base" disabled={status.isPending} onClick={() => status.mutate('IN_REVIEW')}>
              <PlayCircle className="h-5 w-5" /> Empezar
            </Button>
          ) : null}
          {t.status === 'AWAITING_RESIDENT' ? (
            <Button variant="outline" className="h-12 text-base" disabled={status.isPending} onClick={() => status.mutate('IN_REVIEW')}>
              <PlayCircle className="h-5 w-5" /> Retomar
            </Button>
          ) : null}
          {t.status === 'IN_REVIEW' || t.status === 'AWAITING_RESIDENT' ? (
            <Button variant="accent" className="h-12 text-base" disabled={status.isPending} onClick={() => status.mutate('RESOLVED')}>
              <CheckCircle2 className="h-5 w-5" /> Marcar resuelta
            </Button>
          ) : null}
          {t.status === 'IN_REVIEW' ? (
            <Button variant="ghost" disabled={status.isPending} onClick={() => status.mutate('AWAITING_RESIDENT')}>
              <PauseCircle className="h-4 w-4" /> Espero respuesta del residente
            </Button>
          ) : null}
          {status.isError ? <p className="text-xs text-red-600">{apiMessage(status.error)}</p> : null}
        </div>
      ) : null}

      {t.unit ? <EntryRequestPanel pqrId={t.id} disabled={done} /> : null}

      <Card className="p-5">
        <h2 className="text-base font-semibold tracking-tight">Conversación</h2>
        <ul className="mt-3 space-y-2">
          {t.comments.length === 0 ? (
            <li className="text-sm text-nexo-muted">Sin mensajes.</li>
          ) : (
            t.comments.map((c) => (
              <li key={c.id} className={cn('rounded-lg border border-nexo-border p-3 text-sm', c.is_internal && 'border-amber-200 bg-amber-50')}>
                <div className="flex justify-between text-xs text-nexo-muted">
                  {fmt(c.created_at)}
                  {c.is_internal ? (
                    <span className="inline-flex items-center gap-1 text-amber-700">
                      <Lock className="h-3 w-3" /> Interna
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 whitespace-pre-line">{c.body}</p>
              </li>
            ))
          )}
        </ul>
        <div className="mt-3 space-y-2 border-t border-nexo-border pt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder={internal ? 'Nota para el equipo…' : 'Mensaje para el residente…'}
            className="w-full rounded-lg border border-nexo-border bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
          />
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-sm text-nexo-muted">
              <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> Nota interna
            </label>
            <Button disabled={!body.trim() || comment.isPending} onClick={() => comment.mutate()}>
              {comment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
            </Button>
          </div>
          {comment.isError ? <p className="text-xs text-red-600">{apiMessage(comment.error)}</p> : null}
        </div>
      </Card>
    </div>
  );
}
