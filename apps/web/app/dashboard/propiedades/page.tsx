'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, UserPlus, UserCheck, Plus, Trash2, ChevronRight, Upload, Pencil } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { InvitesCard, InviteDialog } from '@/components/dashboard/invites';
import { ImportUnitsDialog, UnitDialog, type EditableUnit } from '@/components/dashboard/units-import';
import { cop } from '@/lib/status-badges';

interface Unit extends EditableUnit {
  room_type_id: string | null;
  occupants: number;
}
interface RoomType {
  id: string;
  name: string;
  capacity: number | null;
  baseFee: number | null;
  unitCount: number;
}

export default function PropiedadesPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';

  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<Unit[]>('/units') });
  const roomTypes = useQuery({ queryKey: ['room-types'], queryFn: () => api.get<RoomType[]>('/room-types') });

  const [assignUnit, setAssignUnit] = useState<Unit | null>(null);
  const [inviteUnit, setInviteUnit] = useState<Unit | null>(null);
  const [editUnit, setEditUnit] = useState<Unit | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [filter, setFilter] = useState('');

  const setType = useMutation({
    mutationFn: (v: { unitId: string; roomTypeId: string | null }) =>
      api.patch(`/room-types/units/${v.unitId}`, { roomTypeId: v.roomTypeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      qc.invalidateQueries({ queryKey: ['room-types'] });
    },
  });

  const types = roomTypes.data ?? [];
  const q = filter.trim().toLowerCase();
  const shown = (units.data ?? []).filter(
    (u) => !q || u.unit_number.toLowerCase().includes(q) || (u.tower ?? '').toLowerCase().includes(q),
  );

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Propiedades</h1>
        <p className="mt-1 text-sm text-nexo-muted">Unidades, tipos de habitación y residentes.</p>
      </div>

      {isAdmin ? <InvitesCard /> : null}

      {isAdmin ? <RoomTypesCard types={types} /> : null}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5 pb-2">
          <div>
            <h2 className="text-base font-semibold tracking-tight">
              Unidades{units.data?.length ? <span className="ml-1 text-nexo-muted">({units.data.length})</span> : null}
            </h2>
            <p className="text-xs text-nexo-muted">Toca una unidad para ver su trazabilidad completa.</p>
          </div>
          {isAdmin ? (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                <Plus className="h-4 w-4" /> Agregar
              </Button>
              <Button size="sm" variant="accent" onClick={() => setImportOpen(true)}>
                <Upload className="h-4 w-4" /> Importar
              </Button>
            </div>
          ) : null}
        </div>
        {(units.data?.length ?? 0) > 12 ? (
          <div className="px-5 pb-2">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Buscar unidad o torre…"
              className="h-9 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
            />
          </div>
        ) : null}
        {units.isLoading ? (
          <div className="space-y-2 p-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 w-full animate-pulse rounded bg-nexo-border" />
            ))}
          </div>
        ) : units.isError ? (
          <div className="m-5 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Error al cargar datos. {(units.error as Error).message}
          </div>
        ) : !units.data || units.data.length === 0 ? (
          <div className="p-8 text-center text-sm text-nexo-muted">
            Sin unidades aún.{isAdmin ? ' Usa “Importar” para cargar todas las habitaciones desde Excel.' : ''}
          </div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {shown.slice(0, 500).map((u) => (
              <li key={u.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <Link
                  href={`/dashboard/propiedades/${u.id}`}
                  className="group min-w-0 text-sm hover:text-nexo-teal"
                >
                  <span className="flex items-center gap-1 font-medium">
                    {u.tower ? `${u.tower} · ` : ''}Unidad {u.unit_number}
                    <ChevronRight className="h-4 w-4 text-nexo-faint group-hover:text-nexo-teal" />
                  </span>
                  <span className="block text-xs text-nexo-muted">
                    {u.floor != null ? `Piso ${u.floor} · ` : ''}
                    {u.monthly_fee ? `${cop(u.monthly_fee)} · ` : ''}
                    {u.occupants ? `${u.occupants} residente${u.occupants === 1 ? '' : 's'}` : 'Sin residente'}
                  </span>
                </Link>
                {isAdmin ? (
                  <div className="flex items-center gap-2">
                    <select
                      value={u.room_type_id ?? ''}
                      onChange={(e) => setType.mutate({ unitId: u.id, roomTypeId: e.target.value || null })}
                      className="h-9 rounded-lg border border-nexo-border bg-white px-2 text-xs"
                    >
                      <option value="">Sin tipo</option>
                      {types.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                    <Button size="sm" variant="ghost" onClick={() => setEditUnit(u)} aria-label={`Editar unidad ${u.unit_number}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setInviteUnit(u)}>
                      <UserPlus className="h-4 w-4" /> Invitar
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAssignUnit(u)}
                      title="Vincular una cuenta que ya existe en Clerk (avanzado)"
                      aria-label={`Vincular cuenta existente a la unidad ${u.unit_number}`}
                    >
                      <UserCheck className="h-4 w-4" />
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        {shown.length > 500 ? (
          <p className="px-5 py-3 text-xs text-nexo-muted">Mostrando 500 de {shown.length}. Usa la búsqueda para encontrar una unidad.</p>
        ) : null}
      </Card>

      {assignUnit ? <AssignResidentDialog unit={assignUnit} onClose={() => setAssignUnit(null)} /> : null}
      {inviteUnit ? <InviteDialog unit={inviteUnit} onClose={() => setInviteUnit(null)} /> : null}
      {editUnit ? <UnitDialog unit={editUnit} onClose={() => setEditUnit(null)} /> : null}
      {addOpen ? <UnitDialog onClose={() => setAddOpen(false)} /> : null}
      {importOpen ? <ImportUnitsDialog onClose={() => setImportOpen(false)} /> : null}
    </div>
  );
}

function RoomTypesCard({ types }: { types: RoomType[] }) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [capacity, setCapacity] = useState('');
  const [baseFee, setBaseFee] = useState('');

  const invalidate = () => qc.invalidateQueries({ queryKey: ['room-types'] });
  const create = useMutation({
    mutationFn: () =>
      api.post('/room-types', {
        name: name.trim(),
        capacity: capacity ? Number(capacity) : undefined,
        baseFee: baseFee ? Number(baseFee) : undefined,
      }),
    onSuccess: () => {
      setName('');
      setCapacity('');
      setBaseFee('');
      invalidate();
    },
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/room-types/${id}`), onSuccess: invalidate });

  const cls = 'h-9 rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Card className="p-5">
      <h2 className="text-base font-semibold tracking-tight">Tipos de habitación</h2>
      <p className="text-xs text-nexo-muted">Define los tipos de tu residencia (ej. Sencilla, Doble, Suite).</p>

      {types.length > 0 ? (
        <ul className="mt-3 divide-y divide-nexo-border rounded-lg border border-nexo-border">
          {types.map((t) => (
            <li key={t.id} className="flex items-center justify-between px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{t.name}</span>
                <span className="ml-2 text-xs text-nexo-muted">
                  {t.unitCount} unidad(es){t.capacity ? ` · ${t.capacity} pers.` : ''}
                  {t.baseFee ? ` · $ ${t.baseFee.toLocaleString('es-CO')}` : ''}
                </span>
              </div>
              <button onClick={() => remove.mutate(t.id)} className="text-nexo-faint hover:text-red-600" aria-label="Eliminar">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="grow">
          <label className="text-xs text-nexo-muted">Nombre</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Sencilla" className={`${cls} mt-1 w-full`} />
        </div>
        <div className="w-20">
          <label className="text-xs text-nexo-muted">Cap.</label>
          <input value={capacity} onChange={(e) => setCapacity(e.target.value)} type="number" className={`${cls} mt-1 w-full`} />
        </div>
        <div className="w-28">
          <label className="text-xs text-nexo-muted">Cuota</label>
          <input value={baseFee} onChange={(e) => setBaseFee(e.target.value)} type="number" className={`${cls} mt-1 w-full`} />
        </div>
        <Button variant="accent" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
        </Button>
      </div>
      {create.isError ? <p className="mt-2 text-xs text-red-600">{(create.error as Error).message}</p> : null}
    </Card>
  );
}

function AssignResidentDialog({ unit, onClose }: { unit: Unit; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [clerkUserId, setClerkUserId] = useState('');
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');

  const assign = useMutation({
    mutationFn: () =>
      api.post(`/units/${unit.id}/assign-resident`, {
        clerkUserId: clerkUserId.trim(),
        phone: phone.trim(),
        fullName: fullName.trim() || undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['units'] });
      onClose();
    },
  });

  const fieldCls =
    'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

  return (
    <Dialog open onClose={onClose} title={`Asignar residente — Unidad ${unit.unit_number}`}>
      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium">Clerk User ID</label>
          <input value={clerkUserId} onChange={(e) => setClerkUserId(e.target.value)} placeholder="user_..." className={fieldCls} />
          <p className="mt-1 text-xs text-nexo-muted">
            El ID del usuario en Clerk (Dashboard → Users). El residente debe haberse registrado primero.
          </p>
        </div>
        <div>
          <label className="text-sm font-medium">Teléfono</label>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+57..." className={fieldCls} />
        </div>
        <div>
          <label className="text-sm font-medium">Nombre (opcional)</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls} />
        </div>
        <Button
          variant="accent"
          className="w-full"
          disabled={!clerkUserId.trim() || !phone.trim() || assign.isPending}
          onClick={() => assign.mutate()}
        >
          {assign.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Asignar'}
        </Button>
        {assign.isError ? <p className="text-xs text-red-600">{(assign.error as Error).message}</p> : null}
      </div>
    </Dialog>
  );
}
