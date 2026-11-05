'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { PQR_STATUS, PQR_CATEGORY } from '@/lib/status-badges';
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
  created_at: string;
  comments: PqrComment[];
  attachmentUrls?: string[];
}

function fmt(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function PortalSolicitudDetail() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();
  const [body, setBody] = useState('');

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pqr', id],
    queryFn: () => api.get<PqrDetail>(`/pqrs/${id}`),
  });

  const comment = useMutation({
    mutationFn: () => api.post(`/pqrs/${id}/comments`, { body }),
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['pqr', id] });
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-10 text-sm text-nexo-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (isError || !data) {
    return <p className="py-10 text-sm text-red-600">{(error as Error)?.message ?? 'No encontrada'}</p>;
  }

  const st = PQR_STATUS[data.status] ?? { label: data.status, badge: 'bg-gray-100 text-gray-600' };

  return (
    <div className="space-y-4">
      <a href="/portal/solicitudes" className="text-sm text-nexo-muted hover:text-nexo-text">
        ← Volver
      </a>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-lg font-bold tracking-tight">{data.title}</h1>
          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>
            {st.label}
          </span>
        </div>
        <div className="mt-1 text-xs text-nexo-muted">
          {PQR_CATEGORY[data.category] ?? data.category} · {fmt(data.created_at)}
        </div>
        <p className="mt-3 text-sm">{data.description}</p>
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
      </Card>

      <Card className="p-5">
        <h2 className="text-base font-semibold tracking-tight">Comentarios</h2>
        <ul className="mt-3 space-y-2">
          {data.comments.length === 0 ? (
            <li className="text-sm text-nexo-muted">Aún no hay comentarios.</li>
          ) : (
            data.comments.map((c) => (
              <li key={c.id} className="rounded-lg border border-nexo-border p-3 text-sm">
                <div className="text-xs text-nexo-muted">{fmt(c.created_at)}</div>
                <p className="mt-1">{c.body}</p>
              </li>
            ))
          )}
        </ul>
        <div className="mt-3 space-y-2 border-t border-nexo-border pt-3">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={2}
            placeholder="Escribe un comentario…"
            className="w-full rounded-lg border border-nexo-border bg-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
          />
          <Button
            variant="accent"
            className="w-full"
            disabled={!body.trim() || comment.isPending}
            onClick={() => comment.mutate()}
          >
            {comment.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Comentar'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
