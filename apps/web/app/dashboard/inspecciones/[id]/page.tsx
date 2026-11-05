'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Plus, Trash2, Star, Send } from 'lucide-react';
import { useApi, putFileToPresignedUrl } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { TYPE_LABEL, STATUS, CONDITIONS, CONDITION_LABEL } from '@/lib/inspection-labels';
import { cn } from '@/lib/utils';

export const dynamic = 'force-dynamic';

interface Item {
  id: string;
  item_name: string;
  condition: string;
  notes: string | null;
}
interface Photo {
  r2Key: string;
  url: string;
}
interface Room {
  id: string;
  room_name: string;
  overall_rating: number;
  notes: string | null;
  items: Item[];
  photos: Photo[];
}
interface Inspection {
  id: string;
  type: string;
  status: string;
  created_at: string;
  rooms: Room[];
}

export default function InspectionDetail() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();

  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['inspection', id],
    queryFn: () => api.get<Inspection>(`/inspections/${id}`),
  });

  const submit = useMutation({
    mutationFn: () => api.patch(`/inspections/${id}/submit`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inspection', id] }),
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

  const st = STATUS[data.status] ?? { label: data.status, badge: 'bg-gray-100 text-gray-600' };
  const editable = data.status === 'DRAFT';

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <a href="/dashboard/inspecciones" className="text-sm text-nexo-muted hover:text-nexo-text">
        ← Volver
      </a>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Inspección de {TYPE_LABEL[data.type] ?? data.type}</h1>
          <p className="mt-1 text-sm text-nexo-muted">{new Date(data.created_at).toLocaleString('es-CO')}</p>
        </div>
        <span className={cn('shrink-0 rounded-full px-3 py-1 text-xs font-medium', st.badge)}>{st.label}</span>
      </div>

      {data.rooms.length === 0 ? (
        <Card>
          <p className="p-6 text-center text-sm text-nexo-muted">Aún no hay habitaciones registradas.</p>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.rooms.map((room) => (
            <Card key={room.id} className="p-5">
              <div className="flex items-center justify-between">
                <h2 className="font-semibold tracking-tight">{room.room_name}</h2>
                <span className="flex items-center gap-1 text-sm text-amber-500">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Star key={i} className={cn('h-4 w-4', i < room.overall_rating ? 'fill-amber-400' : 'text-nexo-border')} />
                  ))}
                </span>
              </div>
              {room.notes ? <p className="mt-1 text-sm text-nexo-muted">{room.notes}</p> : null}
              {room.items.length > 0 ? (
                <ul className="mt-3 space-y-1">
                  {room.items.map((it) => (
                    <li key={it.id} className="flex items-center justify-between text-sm">
                      <span>{it.item_name}</span>
                      <span className="text-nexo-muted">{CONDITION_LABEL[it.condition] ?? it.condition}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
              {room.photos.length > 0 ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {room.photos.map((p) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={p.r2Key} src={p.url} alt="Foto" className="h-20 w-20 rounded-lg object-cover" />
                  ))}
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}

      {editable ? (
        <>
          <AddRoom inspectionId={id} />
          <Button
            className="w-full"
            disabled={data.rooms.length === 0 || submit.isPending}
            onClick={() => submit.mutate()}
          >
            {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Finalizar y enviar inspección
          </Button>
          {submit.isError ? <p className="text-sm text-red-600">{(submit.error as Error).message}</p> : null}
        </>
      ) : null}
    </div>
  );
}

function AddRoom({ inspectionId }: { inspectionId: string }) {
  const api = useApi();
  const qc = useQueryClient();
  const [roomName, setRoomName] = useState('');
  const [rating, setRating] = useState(3);
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<{ itemName: string; condition: string }[]>([]);
  const [files, setFiles] = useState<File[]>([]);

  const save = useMutation({
    mutationFn: async () => {
      // Upload any photos first, collecting their R2 keys.
      const photoR2Keys: string[] = [];
      for (const file of files) {
        const { uploadUrl, r2Key } = await api.post<{ uploadUrl: string; r2Key: string }>(
          `/inspections/${inspectionId}/photo-url`,
          { roomName: roomName.trim(), filename: file.name, contentType: file.type },
        );
        await putFileToPresignedUrl(uploadUrl, file);
        photoR2Keys.push(r2Key);
      }
      return api.post(`/inspections/${inspectionId}/rooms`, {
        roomName: roomName.trim(),
        overallRating: rating,
        notes: notes.trim() || undefined,
        photoR2Keys,
        items: items.filter((i) => i.itemName.trim()).map((i) => ({ itemName: i.itemName.trim(), condition: i.condition })),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inspection', inspectionId] });
      setRoomName('');
      setRating(3);
      setNotes('');
      setItems([]);
      setFiles([]);
    },
  });

  const cls =
    'mt-1 w-full rounded-lg border border-nexo-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">Agregar habitación</h2>
      <div className="mt-3 space-y-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-xs text-nexo-muted">Habitación</label>
            <input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Sala, Cocina…" className={cls} />
          </div>
          <div>
            <label className="text-xs text-nexo-muted">Calificación</label>
            <select value={rating} onChange={(e) => setRating(Number(e.target.value))} className={cls}>
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} / 5</option>
              ))}
            </select>
          </div>
        </div>
        <div>
          <label className="text-xs text-nexo-muted">Notas (opcional)</label>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className={cls} />
        </div>

        <div>
          <div className="flex items-center justify-between">
            <label className="text-xs text-nexo-muted">Ítems</label>
            <button
              onClick={() => setItems((p) => [...p, { itemName: '', condition: 'BUENO' }])}
              className="text-xs font-medium text-nexo-teal hover:underline"
            >
              + Agregar ítem
            </button>
          </div>
          <div className="mt-1 space-y-2">
            {items.map((it, idx) => (
              <div key={idx} className="flex gap-2">
                <input
                  value={it.itemName}
                  onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, itemName: e.target.value } : x)))}
                  placeholder="Paredes, Piso…"
                  className={`${cls} mt-0 flex-1`}
                />
                <select
                  value={it.condition}
                  onChange={(e) => setItems((p) => p.map((x, i) => (i === idx ? { ...x, condition: e.target.value } : x)))}
                  className={`${cls} mt-0 w-32`}
                >
                  {CONDITIONS.map((c) => (
                    <option key={c} value={c}>{CONDITION_LABEL[c]}</option>
                  ))}
                </select>
                <button onClick={() => setItems((p) => p.filter((_, i) => i !== idx))} className="text-nexo-faint hover:text-red-600">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs text-nexo-muted">Fotos (opcional)</label>
          <input
            type="file"
            accept="image/*"
            multiple
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="mt-1 block w-full text-sm text-nexo-muted file:mr-3 file:rounded-lg file:border-0 file:bg-nexo-bg file:px-3 file:py-2 file:text-sm file:font-medium file:text-nexo-navy"
          />
          {files.length > 0 ? <p className="mt-1 text-xs text-nexo-muted">{files.length} archivo(s) seleccionado(s)</p> : null}
        </div>

        <Button variant="accent" className="w-full" disabled={!roomName.trim() || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          Guardar habitación
        </Button>
        {save.isError ? <p className="text-xs text-red-600">{(save.error as Error).message}</p> : null}
      </div>
    </Card>
  );
}
