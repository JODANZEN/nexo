'use client';

import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, Send, Upload, Users, X } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';

export interface PendingInvite {
  id: string;
  fullName: string;
  phone: string;
  role: 'RESIDENT' | 'GUARD' | 'ADMIN' | 'STAFF';
  team?: string | null;
  unitNumber: string | null;
  occupancyType: string | null;
  createdAt: string;
}
interface BulkResult {
  row: number;
  unitNumber: string;
  phone: string;
  status: 'invited' | 'skipped' | 'error';
  reason?: string;
}

const ROLE_LABEL: Record<PendingInvite['role'], string> = {
  RESIDENT: 'Residente',
  GUARD: 'Portería',
  ADMIN: 'Administración',
  STAFF: 'Personal',
};
const OCC_LABEL: Record<string, string> = {
  OWNER: 'Propietario',
  OWNER_ABSENT: 'Propietario (no reside)',
  TENANT: 'Arrendatario',
};

const fieldCls =
  'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

function errorText(err: unknown): string {
  const raw = (err as Error)?.message ?? 'Error';
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    return Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message ?? raw;
  } catch {
    return raw;
  }
}

/** Pending invitations + entry points to invite staff and bulk-load residents. */
export function InvitesCard() {
  const api = useApi();
  const qc = useQueryClient();
  const invites = useQuery({ queryKey: ['invites'], queryFn: () => api.get<PendingInvite[]>('/invites') });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/invites/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['invites'] }),
  });
  const [teamOpen, setTeamOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const list = invites.data ?? [];

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Invitaciones</h2>
          <p className="text-xs text-nexo-muted">
            La persona entra con su celular (código por SMS) y su cuenta queda conectada sola.
          </p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setTeamOpen(true)}>
            <Users className="h-4 w-4" /> Invitar equipo
          </Button>
          <Button size="sm" variant="accent" onClick={() => setBulkOpen(true)}>
            <Upload className="h-4 w-4" /> Carga masiva
          </Button>
        </div>
      </div>

      {invites.isLoading ? (
        <div className="mt-3 h-8 animate-pulse rounded bg-nexo-border" />
      ) : list.length === 0 ? (
        <p className="mt-3 text-sm text-nexo-muted">No hay invitaciones pendientes.</p>
      ) : (
        <ul className="mt-3 max-h-72 divide-y divide-nexo-border overflow-auto rounded-lg border border-nexo-border">
          {list.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0">
                <span className="font-medium">{i.fullName}</span>
                <span className="ml-2 text-xs text-nexo-muted">
                  {i.phone} · {ROLE_LABEL[i.role]}
                  {i.team ? ` (${i.team})` : ''}
                  {i.unitNumber ? ` · Unidad ${i.unitNumber}` : ''}
                  {i.occupancyType ? ` · ${OCC_LABEL[i.occupancyType] ?? i.occupancyType}` : ''}
                </span>
              </div>
              <button
                onClick={() => revoke.mutate(i.id)}
                className="text-xs text-nexo-faint hover:text-red-600"
                aria-label={`Cancelar invitación de ${i.fullName}`}
              >
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      )}

      {teamOpen ? <InviteDialog onClose={() => setTeamOpen(false)} /> : null}
      {bulkOpen ? <BulkInviteDialog onClose={() => setBulkOpen(false)} /> : null}
    </Card>
  );
}

/** Single invite. With `unit` → resident of that unit; without → staff (portería/admin). */
export function InviteDialog({
  unit,
  onClose,
}: {
  unit?: { id: string; unit_number: string };
  onClose: () => void;
}) {
  const api = useApi();
  const qc = useQueryClient();
  const [phone, setPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<'STAFF' | 'GUARD' | 'ADMIN'>('STAFF');
  const [team, setTeam] = useState('');
  const [occupancyType, setOccupancyType] = useState('OWNER');

  const send = useMutation({
    mutationFn: () =>
      api.post('/invites', {
        phone: phone.trim(),
        fullName: fullName.trim() || undefined,
        role: unit ? 'RESIDENT' : role,
        unitId: unit?.id,
        occupancyType: unit ? occupancyType : undefined,
        team: !unit && role === 'STAFF' ? team.trim() || undefined : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['invites'] });
      onClose();
    },
  });

  return (
    <Dialog open onClose={onClose} title={unit ? `Invitar residente — Unidad ${unit.unit_number}` : 'Invitar al equipo'}>
      <div className="space-y-3">
        {unit ? (
          <div>
            <label className="text-sm font-medium">Tipo</label>
            <select value={occupancyType} onChange={(e) => setOccupancyType(e.target.value)} className={fieldCls}>
              <option value="OWNER">Propietario</option>
              <option value="TENANT">Arrendatario</option>
              <option value="OWNER_ABSENT">Propietario (no reside)</option>
            </select>
          </div>
        ) : (
          <div>
            <label className="text-sm font-medium">Rol</label>
            <select value={role} onChange={(e) => setRole(e.target.value as 'STAFF' | 'GUARD' | 'ADMIN')} className={fieldCls}>
              <option value="STAFF">Personal de operación (mantenimiento, aseo…)</option>
              <option value="GUARD">Portería</option>
              <option value="ADMIN">Administración</option>
            </select>
            {role === 'STAFF' ? (
              <p className="mt-1 text-xs text-nexo-muted">Ve solo sus tareas asignadas, desde el celular.</p>
            ) : null}
          </div>
        )}
        {!unit && role === 'STAFF' ? (
          <div>
            <label className="text-sm font-medium">Equipo</label>
            <input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Mantenimiento" className={fieldCls} />
          </div>
        ) : null}
        <div>
          <label className="text-sm font-medium">Celular</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="300 123 4567"
            inputMode="tel"
            className={fieldCls}
          />
          <p className="mt-1 text-xs text-nexo-muted">Si no escribes indicativo, se usa +57.</p>
        </div>
        <div>
          <label className="text-sm font-medium">Nombre (opcional)</label>
          <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={fieldCls} />
        </div>
        <Button variant="accent" className="w-full" disabled={!phone.trim() || send.isPending} onClick={() => send.mutate()}>
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Enviar invitación
        </Button>
        {send.isError ? <p className="text-xs text-red-600">{errorText(send.error)}</p> : null}
      </div>
    </Dialog>
  );
}

interface ParsedRow {
  unitNumber: string;
  phone: string;
  fullName?: string;
  occupancyType?: string;
}

const OCC_ALIASES: Record<string, string> = {
  propietario: 'OWNER',
  owner: 'OWNER',
  arrendatario: 'TENANT',
  inquilino: 'TENANT',
  tenant: 'TENANT',
  'propietario no reside': 'OWNER_ABSENT',
  owner_absent: 'OWNER_ABSENT',
};

// CSV/Excel paste: unidad, celular, nombre, tipo. Comma, semicolon or tab; header optional.
export function parseInviteCsv(text: string): ParsedRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const rows: ParsedRow[] = [];
  for (const line of lines) {
    const sep = line.includes('\t') ? '\t' : line.includes(';') ? ';' : ',';
    const cols = line.split(sep).map((c) => c.trim().replace(/^"|"$/g, ''));
    const [unitNumber, phone, fullName, tipo] = cols;
    if (!unitNumber || !phone) continue;
    if (/^unidad|^apto|^habitaci/i.test(unitNumber) && /cel|tel|phone/i.test(phone)) continue; // header
    rows.push({
      unitNumber,
      phone,
      fullName: fullName || undefined,
      occupancyType: tipo ? OCC_ALIASES[tipo.toLowerCase()] ?? tipo.toUpperCase() : undefined,
    });
  }
  return rows;
}

export function BulkInviteDialog({ onClose }: { onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const rows = useMemo(() => parseInviteCsv(text), [text]);
  const [progress, setProgress] = useState<string | null>(null);
  // Chunked so a 1,500-row load never hits a request timeout.
  const send = useMutation({
    mutationFn: async () => {
      const all: BulkResult[] = [];
      for (let i = 0; i < rows.length; i += 150) {
        setProgress(`${Math.min(i + 150, rows.length)} de ${rows.length}…`);
        const res = await api.post<{ results: BulkResult[] }>('/invites/bulk', { rows: rows.slice(i, i + 150) });
        all.push(...res.results.map((r) => ({ ...r, row: r.row + i })));
      }
      return { results: all };
    },
    onSettled: () => {
      setProgress(null);
      qc.invalidateQueries({ queryKey: ['invites'] });
      qc.invalidateQueries({ queryKey: ['units'] });
    },
  });
  const results = send.data?.results;
  const counts = results
    ? {
        invited: results.filter((r) => r.status === 'invited').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
        error: results.filter((r) => r.status === 'error').length,
      }
    : null;

  async function onFile(file: File | undefined) {
    if (file) setText(await file.text());
  }

  return (
    <Dialog open onClose={onClose} title="Carga masiva de residentes">
      {!results ? (
        <div className="space-y-3">
          <p className="text-sm text-nexo-muted">
            Pega desde Excel o sube un CSV con columnas: <b>unidad, celular, nombre, tipo</b>. El tipo es
            opcional (propietario o arrendatario). Las unidades deben existir ya en Nexo.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={8}
            placeholder={'unidad,celular,nombre,tipo\n101,3001234567,Laura Gómez,propietario\n102,3109876543,Andrés Ruiz,arrendatario'}
            className="w-full rounded-lg border border-nexo-border bg-white p-3 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-nexo-teal"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm text-nexo-teal">
            <Upload className="h-4 w-4" /> Subir archivo .csv
            <input type="file" accept=".csv,text/csv,text/plain" className="sr-only" onChange={(e) => onFile(e.target.files?.[0])} />
          </label>
          <Button variant="accent" className="w-full" disabled={rows.length === 0 || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {send.isPending
              ? `Invitando ${progress ?? ''}`
              : rows.length
                ? `Invitar ${rows.length} residente${rows.length === 1 ? '' : 's'}`
                : 'Invitar'}
          </Button>
          {send.isError ? <p className="text-xs text-red-600">{errorText(send.error)}</p> : null}
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm">
            <b>{counts!.invited}</b> invitados · <b>{counts!.skipped}</b> ya existían · <b>{counts!.error}</b> con error
          </p>
          {counts!.error + counts!.skipped > 0 ? (
            <ul className="max-h-60 divide-y divide-nexo-border overflow-auto rounded-lg border border-nexo-border text-xs">
              {results
                .filter((r) => r.status !== 'invited')
                .map((r) => (
                  <li key={r.row} className="flex justify-between gap-2 px-3 py-2">
                    <span>
                      Fila {r.row}: unidad {r.unitNumber || '—'}, {r.phone || '—'}
                    </span>
                    <span className={r.status === 'error' ? 'text-red-600' : 'text-nexo-muted'}>{r.reason}</span>
                  </li>
                ))}
            </ul>
          ) : null}
          <Button className="w-full" onClick={onClose}>
            <X className="h-4 w-4" /> Cerrar
          </Button>
        </div>
      )}
    </Dialog>
  );
}
