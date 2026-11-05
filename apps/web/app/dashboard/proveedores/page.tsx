'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, Plus, Trash2, Network } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Skeleton, ErrorState, EmptyState } from '@/components/ui/states';

export const dynamic = 'force-dynamic';

interface Provider {
  id: string;
  name: string;
  category: string | null;
  phone: string | null;
  email: string | null;
  notes: string | null;
}

export default function ProveedoresPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  const [open, setOpen] = useState(false);

  const list = useQuery({ queryKey: ['proveedores'], queryFn: () => api.get<Provider[]>('/proveedores') });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/proveedores/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['proveedores'] }),
  });

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Proveedores</h1>
          <p className="mt-1 text-sm text-nexo-muted">Directorio de proveedores del conjunto.</p>
        </div>
        {isAdmin ? (
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo proveedor
          </Button>
        ) : null}
      </div>

      {list.isLoading ? (
        <Card className="p-5">
          <Skeleton rows={4} />
        </Card>
      ) : list.isError ? (
        <ErrorState error={list.error} />
      ) : !list.data || list.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Network className="h-8 w-8 text-nexo-faint" />}>Sin proveedores aún.</EmptyState>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-nexo-border">
            {list.data.map((p) => (
              <li key={p.id} className="flex items-start justify-between gap-3 px-5 py-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    {p.category ? (
                      <span className="rounded-full bg-nexo-bg px-2 py-0.5 text-xs text-nexo-muted">{p.category}</span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-sm text-nexo-muted">
                    {[p.phone, p.email].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {p.notes ? <div className="mt-0.5 text-xs text-nexo-muted">{p.notes}</div> : null}
                </div>
                {isAdmin ? (
                  <button
                    onClick={() => remove.mutate(p.id)}
                    disabled={remove.isPending}
                    className="text-nexo-faint hover:text-red-600 disabled:opacity-50"
                    aria-label="Eliminar"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <NewProviderDialog open={open} onClose={() => setOpen(false)} />
    </div>
  );
}

function NewProviderDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [form, setForm] = useState({ name: '', category: '', phone: '', email: '', notes: '' });

  const create = useMutation({
    mutationFn: () =>
      api.post('/proveedores', {
        name: form.name.trim(),
        category: form.category.trim() || undefined,
        phone: form.phone.trim() || undefined,
        email: form.email.trim() || undefined,
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['proveedores'] });
      setForm({ name: '', category: '', phone: '', email: '', notes: '' });
      onClose();
    },
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Dialog open={open} onClose={onClose} title="Nuevo proveedor">
      <div className="space-y-3">
        <div>
          <label className="text-xs text-nexo-muted">Nombre</label>
          <input value={form.name} onChange={set('name')} className={cls} />
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Categoría (opcional)</label>
          <input value={form.category} onChange={set('category')} placeholder="Aseo, Mantenimiento…" className={cls} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Teléfono</label>
            <input value={form.phone} onChange={set('phone')} className={cls} />
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Email</label>
            <input value={form.email} onChange={set('email')} className={cls} />
          </div>
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Notas (opcional)</label>
          <input value={form.notes} onChange={set('notes')} className={cls} />
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!form.name.trim() || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Guardar'}
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{(create.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
