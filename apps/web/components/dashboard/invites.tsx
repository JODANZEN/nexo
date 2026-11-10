'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Copy, Loader2, MessageCircle, Printer, RefreshCw, Send, Upload, Users, X } from 'lucide-react';
import { inviteMessage, inviteSignInUrl, inviteWhatsAppLink } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
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
  inviteSentAt: string | null;
}
export interface InviteSettings {
  conjuntoName: string;
  /** true when the API sends the SMS/WhatsApp by itself (Twilio + APP_URL configured). */
  automatic: boolean;
  cooldownMinutes: number;
}
interface ResendResult {
  sent: boolean;
  reason?: 'not_configured';
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

function sentLabel(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    timeZone: 'America/Bogota',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  const settings = useQuery({
    queryKey: ['invites', 'settings'],
    queryFn: () => api.get<InviteSettings>('/invites/settings'),
  });
  // Per-row feedback for "Reenviar" / "Copiar" (which row, what to say).
  const [note, setNote] = useState<{ id: string; text: string; error?: boolean } | null>(null);
  const resend = useMutation({
    mutationFn: (id: string) => api.post<ResendResult>(`/invites/${id}/resend`, {}),
    onSuccess: (res, id) => {
      setNote(
        res.sent
          ? { id, text: 'Mensaje enviado.' }
          : { id, text: 'El envío automático aún no está activo. Compártela por WhatsApp.', error: true },
      );
      qc.invalidateQueries({ queryKey: ['invites'] });
    },
    onError: (err, id) => setNote({ id, text: errorText(err), error: true }),
  });
  const [teamOpen, setTeamOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const list = invites.data ?? [];

  // Same text the API sends, pointing at this site's sign-in.
  const [origin, setOrigin] = useState('');
  useEffect(() => setOrigin(window.location.origin), []);
  const message = settings.data && origin ? inviteMessage(settings.data.conjuntoName, inviteSignInUrl(origin)) : null;
  const automatic = settings.data?.automatic ?? false;

  async function copy(id: string) {
    if (!message) return;
    try {
      await navigator.clipboard.writeText(message);
      setNote({ id, text: 'Mensaje copiado.' });
    } catch {
      setNote({ id, text: 'No se pudo copiar. Usa el enlace de WhatsApp.', error: true });
    }
  }

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold tracking-tight">Invitaciones</h2>
          <p className="text-xs text-nexo-muted">
            La persona entra con su celular (código por SMS) y su cuenta queda conectada sola.
          </p>
          {settings.data ? (
            <p className="mt-1 text-xs text-nexo-muted">
              {automatic
                ? 'Al invitar, le llega un mensaje con el enlace para entrar.'
                : 'El mensaje automático aún no está activo: comparte cada invitación por WhatsApp o imprime el afiche.'}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/dashboard/propiedades/afiche" className={buttonVariants({ variant: 'outline', size: 'sm' })}>
            <Printer className="h-4 w-4" /> Afiche con QR
          </Link>
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
            <li key={i.id} className="px-3 py-2 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                <div className="min-w-0">
                  <span className="font-medium">{i.fullName}</span>
                  <span className="ml-2 text-xs text-nexo-muted">
                    {i.phone} · {ROLE_LABEL[i.role]}
                    {i.team ? ` (${i.team})` : ''}
                    {i.unitNumber ? ` · Unidad ${i.unitNumber}` : ''}
                    {i.occupancyType ? ` · ${OCC_LABEL[i.occupancyType] ?? i.occupancyType}` : ''}
                    {i.inviteSentAt ? ` · Mensaje enviado ${sentLabel(i.inviteSentAt)}` : ''}
                  </span>
                </div>
                <div className="flex shrink-0 items-center gap-3 text-xs">
                  {message ? (
                    <>
                      <a
                        href={inviteWhatsAppLink(i.phone, message)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-nexo-teal hover:underline"
                        aria-label={`Enviar invitación por WhatsApp a ${i.fullName}`}
                      >
                        <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                      </a>
                      <button
                        onClick={() => copy(i.id)}
                        className="inline-flex items-center gap-1 text-nexo-muted hover:text-nexo-text"
                        aria-label={`Copiar mensaje de invitación para ${i.fullName}`}
                      >
                        {note?.id === i.id && note.text === 'Mensaje copiado.' ? (
                          <Check className="h-3.5 w-3.5" />
                        ) : (
                          <Copy className="h-3.5 w-3.5" />
                        )}{' '}
                        Copiar
                      </button>
                    </>
                  ) : null}
                  {automatic ? (
                    <button
                      onClick={() => resend.mutate(i.id)}
                      disabled={resend.isPending}
                      className="inline-flex items-center gap-1 text-nexo-muted hover:text-nexo-text disabled:opacity-50"
                      aria-label={`Reenviar invitación a ${i.fullName}`}
                    >
                      {resend.isPending && resend.variables === i.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}{' '}
                      Reenviar
                    </button>
                  ) : null}
                  <button
                    onClick={() => revoke.mutate(i.id)}
                    className="text-nexo-faint hover:text-red-600"
                    aria-label={`Cancelar invitación de ${i.fullName}`}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
              {note?.id === i.id ? (
                <p role="status" className={`mt-1 text-xs ${note.error ? 'text-red-600' : 'text-nexo-teal'}`}>
                  {note.text}
                </p>
              ) : null}
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
