'use client';

import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Clock, Loader2, Plus, Route, Save, Trash2, Users } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { PQR_CATEGORY } from '@/lib/status-badges';
import { PRIORITY, SCOPE } from '@/lib/ticket-labels';
import { cn } from '@/lib/utils';

type Priority = 'P1' | 'P2' | 'P3' | 'P4';
interface SlaTarget {
  firstResponse: number;
  resolution: number;
  businessHours: boolean;
}
interface BusinessHours {
  days: number[];
  start: string;
  end: string;
  holidays: string[];
  nationalHolidays: boolean;
}
interface OpsConfig {
  sla: Record<Priority, SlaTarget>;
  businessHours: BusinessHours;
}
interface Member {
  id: string;
  name: string;
  role: string;
  team: string | null;
  isTeamLead: boolean;
  pending: boolean;
  openTickets: number;
}
interface Rule {
  id: string;
  name: string;
  category: string | null;
  scope: string | null;
  assignee_ids: string[];
  sort_order: number;
  is_active: boolean;
}

const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const PRIORITIES: Priority[] = ['P1', 'P2', 'P3', 'P4'];
const inputCls =
  'h-9 rounded-lg border border-nexo-border bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

function apiMessage(err: unknown): string {
  const raw = (err as Error)?.message ?? 'Error';
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    return Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message ?? raw;
  } catch {
    return raw;
  }
}

export default function OperacionPage() {
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Operación</h1>
        <p className="mt-1 text-sm text-nexo-muted">
          Tiempos objetivo de las solicitudes, horario de atención, equipo y asignación automática.
        </p>
      </div>
      {isAdmin ? (
        <>
          <TargetsCard />
          <TeamCard />
          <RulesCard />
        </>
      ) : (
        <Card className="p-5 text-sm text-nexo-muted">Solo administración puede cambiar la operación.</Card>
      )}
    </div>
  );
}

function TargetsCard() {
  const api = useApi();
  const qc = useQueryClient();
  const config = useQuery({ queryKey: ['operations', 'config'], queryFn: () => api.get<OpsConfig>('/operations/config') });
  const [draft, setDraft] = useState<OpsConfig | null>(null);
  const [holText, setHolText] = useState<string | null>(null);
  useEffect(() => {
    if (config.data && !draft) setDraft(config.data);
  }, [config.data, draft]);
  const save = useMutation({
    mutationFn: () => api.patch<OpsConfig>('/operations/config', draft),
    onSuccess: (data) => {
      setDraft(data);
      qc.setQueryData(['operations', 'config'], data);
    },
  });

  if (config.isLoading || !draft) return <Card className="p-5">{config.isError ? <ErrorState error={config.error} /> : <Skeleton />}</Card>;

  const setTarget = (p: Priority, patch: Partial<SlaTarget>) =>
    setDraft({ ...draft, sla: { ...draft.sla, [p]: { ...draft.sla[p], ...patch } } });
  const bh = draft.businessHours;
  const setBh = (patch: Partial<BusinessHours>) => setDraft({ ...draft, businessHours: { ...bh, ...patch } });
  const dirty = JSON.stringify(draft) !== JSON.stringify(config.data);

  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Clock className="h-4 w-4" /> Tiempos objetivo
      </h2>
      <p className="text-xs text-nexo-muted">
        En horas. “Horario hábil” cuenta solo el horario de atención (sin noches, domingos ni festivos). Aplica a las
        solicitudes nuevas.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-nexo-muted">
              <th className="py-2 pr-2 font-medium">Prioridad</th>
              <th className="py-2 pr-2 font-medium">Primera respuesta</th>
              <th className="py-2 pr-2 font-medium">Resolución</th>
              <th className="py-2 font-medium">Horario hábil</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-nexo-border">
            {PRIORITIES.map((p) => (
              <tr key={p}>
                <td className="py-2 pr-2">
                  <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PRIORITY[p].badge)}>
                    {PRIORITY[p].label}
                  </span>
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min={0.25}
                    step={0.25}
                    value={draft.sla[p].firstResponse}
                    onChange={(e) => setTarget(p, { firstResponse: Number(e.target.value) })}
                    className={cn(inputCls, 'w-20')}
                    aria-label={`Primera respuesta ${p} en horas`}
                  />
                </td>
                <td className="py-2 pr-2">
                  <input
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={draft.sla[p].resolution}
                    onChange={(e) => setTarget(p, { resolution: Number(e.target.value) })}
                    className={cn(inputCls, 'w-20')}
                    aria-label={`Resolución ${p} en horas`}
                  />
                </td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={draft.sla[p].businessHours}
                    onChange={(e) => setTarget(p, { businessHours: e.target.checked })}
                    aria-label={`${p} en horario hábil`}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 className="mt-5 text-sm font-semibold">Horario de atención</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {DAYS.map((d, i) => {
          const on = bh.days.includes(i);
          return (
            <button
              key={d}
              onClick={() => setBh({ days: on ? bh.days.filter((x) => x !== i) : [...bh.days, i].sort() })}
              className={cn(
                'h-8 rounded-lg border px-3 text-xs font-medium',
                on ? 'border-nexo-teal bg-nexo-teal/10 text-nexo-teal' : 'border-nexo-border text-nexo-muted',
              )}
              aria-pressed={on}
            >
              {d}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <label className="flex items-center gap-2">
          De <input type="time" value={bh.start} onChange={(e) => setBh({ start: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-2">
          a <input type="time" value={bh.end} onChange={(e) => setBh({ end: e.target.value })} className={inputCls} />
        </label>
        <label className="flex items-center gap-2 text-nexo-muted">
          <input
            type="checkbox"
            checked={bh.nationalHolidays}
            onChange={(e) => setBh({ nationalHolidays: e.target.checked })}
          />
          Excluir festivos de Colombia
        </label>
      </div>
      <label className="mt-3 block text-sm">
        <span className="text-xs text-nexo-muted">Otros días no hábiles (AAAA-MM-DD, separados por coma)</span>
        <input
          value={holText ?? bh.holidays.join(', ')}
          onChange={(e) => {
            setHolText(e.target.value);
            setBh({ holidays: e.target.value.split(/[,\s]+/).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)) });
          }}
          placeholder="2026-12-24, 2026-12-31"
          className={cn(inputCls, 'mt-1 w-full')}
        />
      </label>

      <div className="mt-4 flex items-center gap-3">
        <Button variant="accent" disabled={!dirty || save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Guardar
        </Button>
        {save.isSuccess && !dirty ? <span className="text-xs text-green-600">Guardado</span> : null}
        {save.isError ? <span className="text-xs text-red-600">{apiMessage(save.error)}</span> : null}
      </div>
    </Card>
  );
}

function useTeam() {
  const api = useApi();
  return useQuery({ queryKey: ['operations', 'team'], queryFn: () => api.get<Member[]>('/operations/team') });
}

function TeamCard() {
  const api = useApi();
  const qc = useQueryClient();
  const team = useTeam();
  const setTeam = useMutation({
    mutationFn: (v: { id: string; team: string }) => api.patch(`/operations/team/${v.id}`, { team: v.team || null }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations', 'team'] }),
  });
  const setLead = useMutation({
    mutationFn: (v: { id: string; isTeamLead: boolean }) =>
      api.patch(`/operations/team/${v.id}/lead`, { isTeamLead: v.isTeamLead }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['operations', 'team'] }),
  });
  return (
    <Card className="p-5">
      <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
        <Users className="h-4 w-4" /> Equipo
      </h2>
      <p className="text-xs text-nexo-muted">
        Invita personal desde Propiedades → Invitaciones → “Invitar equipo”. Cada persona ve sus tareas en el celular.
        El jefe de área ve además las solicitudes de todo su equipo y puede reasignarlas dentro de él.
      </p>
      {team.isLoading ? (
        <div className="mt-3">
          <Skeleton rows={2} />
        </div>
      ) : team.isError ? (
        <div className="mt-3">
          <ErrorState error={team.error} />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-nexo-border rounded-lg border border-nexo-border text-sm">
          {(team.data ?? []).map((m) => (
            <li key={m.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div>
                <span className="font-medium">{m.name}</span>
                <span className="ml-2 text-xs text-nexo-muted">
                  {m.role === 'ADMIN' ? 'Administración' : 'Personal'}
                  {m.pending ? ' · invitación pendiente' : ''} · {m.openTickets} abiertas
                </span>
              </div>
              {m.role === 'STAFF' ? (
                <div className="flex items-center gap-3">
                  <label
                    className={cn('flex items-center gap-1.5 text-xs', m.team ? 'text-nexo-text' : 'text-nexo-faint')}
                    title={m.team ? undefined : 'Primero asígnale un equipo'}
                  >
                    <input
                      type="checkbox"
                      checked={m.isTeamLead}
                      disabled={setLead.isPending || (!m.team && !m.isTeamLead)}
                      onChange={(e) => setLead.mutate({ id: m.id, isTeamLead: e.target.checked })}
                      aria-label={`${m.name} es jefe de área`}
                    />
                    Jefe de área
                  </label>
                  <input
                    defaultValue={m.team ?? ''}
                    placeholder="Equipo"
                    onBlur={(e) => e.target.value !== (m.team ?? '') && setTeam.mutate({ id: m.id, team: e.target.value })}
                    className={cn(inputCls, 'w-40')}
                    aria-label={`Equipo de ${m.name}`}
                  />
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {setLead.isError ? <p className="mt-2 text-xs text-red-600">{apiMessage(setLead.error)}</p> : null}
    </Card>
  );
}

function RulesCard() {
  const api = useApi();
  const qc = useQueryClient();
  const team = useTeam();
  const rules = useQuery({ queryKey: ['operations', 'rules'], queryFn: () => api.get<Rule[]>('/operations/routing-rules') });
  const [open, setOpen] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['operations', 'rules'] });
  const toggle = useMutation({
    mutationFn: (r: Rule) => api.patch(`/operations/routing-rules/${r.id}`, { isActive: !r.is_active }),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: string) => api.del(`/operations/routing-rules/${id}`), onSuccess: invalidate });
  const nameOf = (id: string) => team.data?.find((m) => m.id === id)?.name ?? '—';

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
            <Route className="h-4 w-4" /> Asignación automática
          </h2>
          <p className="text-xs text-nexo-muted">
            Cada solicitud nueva va a la primera regla que coincida, y dentro de ella a quien tenga menos tareas abiertas.
          </p>
        </div>
        <Button size="sm" variant="accent" onClick={() => setOpen(true)}>
          <Plus className="h-4 w-4" /> Regla
        </Button>
      </div>
      {rules.isLoading ? (
        <div className="mt-3">
          <Skeleton rows={2} />
        </div>
      ) : rules.isError ? (
        <div className="mt-3">
          <ErrorState error={rules.error} />
        </div>
      ) : !rules.data?.length ? (
        <p className="mt-3 text-sm text-nexo-muted">
          Sin reglas: las solicitudes quedan sin responsable hasta que alguien las asigne.
        </p>
      ) : (
        <ol className="mt-3 divide-y divide-nexo-border rounded-lg border border-nexo-border text-sm">
          {rules.data.map((r, i) => (
            <li key={r.id} className={cn('flex flex-wrap items-center justify-between gap-2 px-3 py-2', !r.is_active && 'opacity-50')}>
              <div className="min-w-0">
                <span className="mr-2 text-xs text-nexo-faint">{i + 1}.</span>
                <span className="font-medium">{r.name}</span>
                <span className="ml-2 text-xs text-nexo-muted">
                  {r.category ? PQR_CATEGORY[r.category] : 'Cualquier categoría'} ·{' '}
                  {r.scope ? SCOPE[r.scope] : 'cualquier lugar'} → {r.assignee_ids.map(nameOf).join(', ')}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button onClick={() => toggle.mutate(r)} className="text-xs text-nexo-teal">
                  {r.is_active ? 'Pausar' : 'Activar'}
                </button>
                <button onClick={() => remove.mutate(r.id)} className="text-nexo-faint hover:text-red-600" aria-label={`Eliminar ${r.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      {open ? <RuleDialog members={team.data ?? []} next={(rules.data?.length ?? 0) + 1} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}

function RuleDialog({ members, next, onClose }: { members: Member[]; next: number; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [scope, setScope] = useState('');
  const [ids, setIds] = useState<string[]>([]);
  const create = useMutation({
    mutationFn: () =>
      api.post('/operations/routing-rules', {
        name: name.trim() || (category ? PQR_CATEGORY[category] : 'General'),
        category: category || null,
        scope: scope || null,
        assigneeIds: ids,
        sortOrder: next * 10,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operations', 'rules'] });
      onClose();
    },
  });
  const field = 'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm';
  return (
    <Dialog open onClose={onClose} title="Nueva regla de asignación">
      <div className="space-y-3">
        <label className="block text-sm font-medium">
          Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Mantenimiento en habitaciones" className={field} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Categoría
            <select value={category} onChange={(e) => setCategory(e.target.value)} className={field}>
              <option value="">Cualquiera</option>
              {Object.entries(PQR_CATEGORY).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Lugar
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={field}>
              <option value="">Cualquiera</option>
              {Object.entries(SCOPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <fieldset>
          <legend className="text-sm font-medium">Responsables</legend>
          <div className="mt-1 max-h-48 space-y-1 overflow-auto rounded-lg border border-nexo-border p-2">
            {members.map((m) => (
              <label key={m.id} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={ids.includes(m.id)}
                  onChange={(e) => setIds(e.target.checked ? [...ids, m.id] : ids.filter((x) => x !== m.id))}
                />
                {m.name}
                <span className="text-xs text-nexo-muted">{m.team ?? (m.role === 'ADMIN' ? 'Admin' : '')}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Button variant="accent" className="w-full" disabled={!ids.length || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear regla
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{apiMessage(create.error)}</p> : null}
      </div>
    </Dialog>
  );
}
