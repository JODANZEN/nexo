'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Plus, Trash2, Megaphone, Pin } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

interface Announcement {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AnunciosPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  const [open, setOpen] = useState(false);

  const list = useQuery({ queryKey: ['anuncios'], queryFn: () => api.get<Announcement[]>('/anuncios') });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/anuncios/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['anuncios'] }),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Anuncios</h1>
          <p className="mt-1 text-sm text-nexo-muted">Cartelera de la administración.</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo anuncio
          </Button>
        ) : null}
      </div>

      {list.isLoading ? (
        <Card className="p-5">
          <Skeleton rows={3} />
        </Card>
      ) : list.isError ? (
        <ErrorState error={list.error} />
      ) : !list.data || list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Megaphone className="h-8 w-8 text-nexo-faint" />}>Sin anuncios aún.</EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {list.data.map((a) => (
            <Card key={a.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  {a.pinned ? <Pin className="h-4 w-4 text-nexo-teal" /> : null}
                  <h2 className="font-semibold tracking-tight">{a.title}</h2>
                </div>
                {isAdmin ? (
                  <button
                    onClick={() => remove.mutate(a.id)}
                    disabled={remove.isPending}
                    className="text-nexo-faint hover:text-red-600 disabled:opacity-50"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-nexo-text">{a.body}</p>
              <p className="mt-2 text-xs text-nexo-muted">{fmtDate(a.created_at)}</p>
            </Card>
          ))}
        </div>
      )}

      <NewAnnouncementDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewAnnouncementDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);

  const create = useMutation({
    mutationFn: () => api.post('/anuncios', { title: title.trim(), body: body.trim(), pinned }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['anuncios'] });
      setTitle('');
      setBody('');
      setPinned(false);
      onClose();
    },
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo anuncio">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Título</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} className={cls} />
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Mensaje</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={cls} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
          Fijar arriba
        </label>
        <Button
          variant="accent"
          className="w-full"
          disabled={!title.trim() || !body.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Publicar'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
