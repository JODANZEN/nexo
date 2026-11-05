'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, ImagePlus } from 'lucide-react';
import { useApi, putFileToPresignedUrl } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { PQR_STATUS, PQR_CATEGORY } from '@/lib/status-badges';
import { cn } from '@/lib/utils';

interface Pqr {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function PortalSolicitudes() {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pqrs'],
    queryFn: () => api.get<Pqr[]>('/pqrs'),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold tracking-tight">Solicitudes</h1>

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-8 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        ) : isError ? (
          <div className="p-8 text-center text-sm text-red-600">{(error as Error).message}</div>
        ) : !data || data.length === 0 ? (
          <div className="p-8 text-center text-sm text-nexo-muted">No tienes solicitudes.</div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {data.map((p) => {
              const st = PQR_STATUS[p.status] ?? { label: p.status, badge: 'bg-gray-100 text-gray-600' };
              return (
                <li key={p.id}>
                  <Link
                    href={`/portal/solicitudes/${p.id}`}
                    className="flex items-start justify-between gap-3 px-5 py-4 transition-colors hover:bg-nexo-bg"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">{p.title}</div>
                      <div className="mt-0.5 text-xs text-nexo-muted">
                        {PQR_CATEGORY[p.category] ?? p.category} · {fmtDate(p.created_at)}
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

      {/* Floating action button */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-20 right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-nexo-teal text-white shadow-lg shadow-nexo-teal/30"
        aria-label="Nueva solicitud"
      >
        <Plus className="h-6 w-6" />
      </button>

      <NewPqrDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewPqrDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [category, setCategory] = useState('MAINTENANCE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      let attachments: string[] = [];
      if (file) {
        const { uploadUrl, r2Key } = await api.post<{ uploadUrl: string; r2Key: string }>('/pqrs/photo-url', {
          filename: file.name,
          contentType: file.type,
        });
        await putFileToPresignedUrl(uploadUrl, file);
        attachments = [r2Key];
      }
      return api.post('/pqrs', { category, title: title.trim(), description: description.trim(), attachments });
    },
    onSuccess: () => {
      setTitle('');
      setDescription('');
      setFile(null);
      qc.invalidateQueries({ queryKey: ['pqrs'] });
      onClose();
    },
  });

  const fieldCls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nueva solicitud">
      <div className="space-y-3">
        <select value={category} onChange={(e) => setCategory(e.target.value)} className={fieldCls}>
          {Object.entries(PQR_CATEGORY).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Asunto" className={fieldCls} />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          placeholder="Describe tu solicitud…"
          className={fieldCls}
        />
        <label className="flex cursor-pointer items-center gap-2 text-sm text-nexo-muted">
          <ImagePlus className="h-4 w-4" />
          {file ? file.name : 'Adjuntar foto (opcional)'}
          <input
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </label>
        <Button
          variant="accent"
          className="w-full"
          disabled={!title.trim() || !description.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Enviar'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
