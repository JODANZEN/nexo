'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Lock, AlertTriangle } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PQR_STATUS, PQR_CATEGORY } from '@/lib/status-badges';
import { PRIORITY, SCOPE, slaState } from '@/lib/ticket-labels';
import { cn } from '@/lib/utils';

interface PqrComment {
  id: string;
  body: string;
  is_internal: boolean;
  created_at: string;
}
interface PqrDetail {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  scope: string;
  resolution_due_at: string | null;
  sla_breached: boolean;
  assigned_to_id: string | null;
  escalation_level: number;
  created_at: string;
  comments: PqrComment[];
  attachmentUrls?: string[];
}
interface Member {
  id: string;
  name: string;
  role: string;
}

const NEXT_STATUS: Record<string, string[]> = {
  OPEN: ['IN_REVIEW'],
  IN_REVIEW: ['AWAITING_RESIDENT', 'RESOLVED'],
  AWAITING_RESIDENT: ['IN_REVIEW', 'RESOLVED'],
  RESOLVED: ['CLOSED'],
  CLOSED: [],
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function SolicitudDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';

  const [body, setBody] = useState('');
  const [internal, setInternal] = useState(false);

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pqr', id],
    queryFn: () => api.get<PqrDetail>(`/pqrs/${id}`),
  });
  const members = useQuery({
    queryKey: ['comunidad', 'directory'],
    queryFn: () => api.get<Member[]>('/comunidad/directory'),
    enabled: isAdmin,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['pqr', id] });
    qc.invalidateQueries({ queryKey: ['pqrs'] });
  };
  const comment = useMutation({
    mutationFn: () => api.post(`/pqrs/${id}/comments`, { body, isInternal: internal }),
    onSuccess: () => {
      setBody('');
      setInternal(false);
      invalidate();
    },
  });
  const changeStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/pqrs/${id}/status`, { status }),
    onSuccess: invalidate,
  });
  const setPriority = useMutation({
    mutationFn: (priority: string) => api.patch(`/pqrs/${id}/priority`, { priority }),
    onSuccess: invalidate,
  });
  const assign = useMutation({
    mutationFn: (assigneeUserId: string) => api.patch(`/pqrs/${id}/assign`, { assigneeUserId }),
    onSuccess: invalidate,
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-nexo-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (isError || !data) {
    return <p className="p-10 text-sm text-red-600">Error: {(error as Error)?.message ?? 'no encontrada'}</p>;
  }

  const st = PQR_STATUS[data.status] ?? { label: data.status, badge: 'bg-gray-100 text-gray-600' };
  const pr = PRIORITY[data.priority] ?? { label: data.priority, badge: 'bg-gray-100 text-gray-600' };
  const sla = slaState(data);
  const assignee = members.data?.find((m) => m.id === data.assigned_to_id);
  const selectCls = 'h-9 rounded-lg border border-nexo-border bg-white px-2 text-sm';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <a href="/dashboard/solicitudes" className="text-sm text-nexo-muted hover:text-nexo-text">
        ← Volver a solicitudes
      </a>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', pr.badge)}>{pr.label}</span>
              <h1 className="text-xl font-bold tracking-tight">{data.title}</h1>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-nexo-muted">
              <span>{SCOPE[data.scope] ?? data.scope}</span>
              <span>·</span>
              <span>{PQR_CATEGORY[data.category] ?? data.category}</span>
              <span>·</span>
              <span>{fmt(data.created_at)}</span>
            </div>
          </div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>{st.label}</span>
        </div>
        <p className="mt-4 text-sm">{data.description}</p>
        {data.attachmentUrls?.length ? (
          <div className="mt-4 flex flex-wrap gap-2">
            {data.attachmentUrls.map((url, i) => (
              <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Foto ${i + 1} de la solicitud`} className="h-24 w-24 rounded-lg border object-cover" />
              </a>
            ))}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-nexo-border pt-3 text-sm">
          {sla.text ? <span className={sla.cls}>{sla.text}</span> : null}
          {data.escalation_level > 0 && data.status !== 'RESOLVED' && data.status !== 'CLOSED' ? (
            <span className="inline-flex items-center gap-1 text-orange-600">
              <AlertTriangle className="h-3.5 w-3.5" /> Escalado (nivel {data.escalation_level})
            </span>
          ) : null}
          <span className="text-nexo-muted">
            Responsable: {assignee ? assignee.name : data.assigned_to_id ? '—' : 'Sin asignar'}
          </span>
        </div>
      </Card>

      {/* Admin management */}
      {isAdmin ? (
        <Card className="p-5">
          <h2 className="text-base font-semibold tracking-tight">Gestión</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="text-xs text-nexo-muted">Prioridad</span>
              <select
                className={cn(selectCls, 'mt-1 w-full')}
                value={data.priority}
                onChange={(e) => setPriority.mutate(e.target.value)}
                disabled={setPriority.isPending}
              >
                {['P1', 'P2', 'P3', 'P4'].map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY[p].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-nexo-muted">Responsable</span>
              <select
                className={cn(selectCls, 'mt-1 w-full')}
                value={data.assigned_to_id ?? ''}
                onChange={(e) => e.target.value && assign.mutate(e.target.value)}
                disabled={assign.isPending}
              >
                <option value="">Sin asignar</option>
                {(members.data ?? []).map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="text-xs text-nexo-muted">Estado</span>
              <select
                className={cn(selectCls, 'mt-1 w-full')}
                value={data.status}
                onChange={(e) => changeStatus.mutate(e.target.value)}
                disabled={changeStatus.isPending || NEXT_STATUS[data.status]?.length === 0}
              >
                <option value={data.status} disabled>
                  {st.label}
                </option>
                {(NEXT_STATUS[data.status] ?? []).map((s) => (
                  <option key={s} value={s}>
                    {PQR_STATUS[s]?.label ?? s}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {changeStatus.isError || setPriority.isError || assign.isError ? (
            <p className="mt-2 text-xs text-red-600">
              {((changeStatus.error ?? setPriority.error ?? assign.error) as Error)?.message}
            </p>
          ) : null}
          <p className="mt-3 text-xs text-nexo-muted">
            Mueve a <strong>“Espera residente”</strong> para pausar el SLA mientras esperas la respuesta del residente
            (se le enviará un recordatorio automático).
          </p>
        </Card>
      ) : null}

      {/* Comment thread */}
      <Card className="p-5">
        <h2 className="text-base font-semibold tracking-tight">Comentarios</h2>
        <ul className="mt-4 space-y-3">
          {data.comments.length === 0 ? (
            <li className="text-sm text-nexo-muted">Aún no hay comentarios.</li>
          ) : (
            data.comments.map((c) => (
              <li
                key={c.id}
                className={cn(
                  'rounded-lg border border-nexo-border p-3 text-sm',
                  c.is_internal && 'border-amber-200 bg-amber-50',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs text-nexo-muted">{fmt(c.created_at)}</span>
                  {c.is_internal ? (
                    <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700">
                      <Lock className="h-3 w-3" /> Nota interna
                    </span>
                  ) : null}
                </div>
                <p className="mt-1">{c.body}</p>
              </li>
            ))
          )}
        </ul>

        <div className="mt-4 space-y-2 border-t border-nexo-border pt-4">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={3}
            placeholder="Escribe un comentario…"
            className="w-full rounded-lg border border-nexo-border bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
          />
          <div className="flex items-center justify-between">
            {isAdmin ? (
              <label className="flex items-center gap-2 text-sm text-nexo-muted">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} />
                Nota interna (solo admins)
              </label>
            ) : (
              <span />
            )}
            <Button disabled={!body.trim() || comment.isPending} onClick={() => comment.mutate()}>
              {comment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Comentar'}
            </Button>
          </div>
          {comment.isError ? <p className="text-xs text-red-600">{(comment.error as Error).message}</p> : null}
        </div>
      </Card>
    </div>
  );
}
