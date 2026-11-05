'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { CalendarClock, Loader2, Play, Plus, Trash2, Wrench } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { PQR_STATUS } from '@/lib/status-badges';
import { PRIORITY, SCOPE } from '@/lib/ticket-labels';
import { cn } from '@/lib/utils';

interface Plan {
  id: string;
  title: string;
  description: string | null;
  scope: string;
  priority: string;
  unit_id: string | null;
  assigned_to_id: string | null;
  interval_unit: 'DAY' | 'WEEK' | 'MONTH';
  interval_count: number;
  next_due_at: string;
  lead_days: number;
  is_active: boolean;
  lastTicket: { id: string; status: string; created_at: string } | null;
}
interface Member {
  id: string;
  name: string;
  team: string | null;
}
interface UnitRef {
  id: string;
  unit_number: string;
  tower: string | null;
}

const UNIT_LABEL = { DAY: ['día', 'días'], WEEK: ['semana', 'semanas'], MONTH: ['mes', 'meses'] } as const;
const every = (p: Pick<Plan, 'interval_unit' | 'interval_count'>) =>
  p.interval_count === 1
    ? `Cada ${UNIT_LABEL[p.interval_unit][0]}`
    : `Cada ${p.interval_count} ${UNIT_LABEL[p.interval_unit][1]}`;

function apiMessage(err: unknown): string {
  const raw = (err as Error)?.message ?? 'Error';
  try {
    const parsed = JSON.parse(raw) as { message?: string | string[] };
    return Array.isArray(parsed.message) ? parsed.message.join(', ') : parsed.message ?? raw;
  } catch {
    return raw;
  }
}

export default function MantenimientoPage() {
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  const plans = useQuery({
    queryKey: ['maintenance-plans'],
    queryFn: () => api.get<Plan[]>('/operations/maintenance-plans'),
    enabled: isAdmin,
  });
  const team = useQuery({
    queryKey: ['operations', 'team'],
    queryFn: () => api.get<Member[]>('/operations/team'),
    enabled: isAdmin,
  });
  const [open, setOpen] = useState(false);
  const invalidate = () => qc.invalidateQueries({ queryKey: ['maintenance-plans'] });
  const toggle = useMutation({
    mutationFn: (p: Plan) => api.patch(`/operations/maintenance-plans/${p.id}`, { isActive: !p.is_active }),
    onSuccess: invalidate,
  });
  const run = useMutation({
    mutationFn: (id: string) => api.post(`/operations/maintenance-plans/${id}/run`),
    onSuccess: () => {
      invalidate();
      qc.invalidateQueries({ queryKey: ['pqrs'] });
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.del(`/operations/maintenance-plans/${id}`),
    onSuccess: invalidate,
  });
  const nameOf = (id: string | null) => (id ? team.data?.find((m) => m.id === id)?.name ?? '—' : 'Asignación automática');

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Mantenimiento preventivo</h1>
          <p className="mt-1 text-sm text-nexo-muted">
            Tareas que se repiten. Nexo crea la solicitud sola cuando toca y la asigna al equipo.
          </p>
        </div>
        {isAdmin ? (
          <Button variant="accent" onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" /> Nuevo plan
          </Button>
        ) : null}
      </div>

      {!isAdmin ? (
        <Card className="p-5 text-sm text-nexo-muted">Solo administración gestiona los planes.</Card>
      ) : plans.isLoading ? (
        <Card className="p-5">
          <Skeleton />
        </Card>
      ) : plans.isError ? (
        <ErrorState error={plans.error} />
      ) : !plans.data?.length ? (
        <Card>
          <EmptyState icon={<Wrench className="h-6 w-6" />}>
            Sin planes aún. Ejemplos: limpieza de tanques cada 6 meses, revisión de extintores cada año, filtros de aire
            cada mes.
          </EmptyState>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.data.map((p) => {
            const last = p.lastTicket ? PQR_STATUS[p.lastTicket.status] : null;
            return (
              <Card key={p.id} className={cn('p-4', !p.is_active && 'opacity-60')}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PRIORITY[p.priority]?.badge)}>
                        {p.priority}
                      </span>
                      <h2 className="font-semibold">{p.title}</h2>
                    </div>
                    <p className="mt-1 text-xs text-nexo-muted">
                      {every(p)} · {SCOPE[p.scope] ?? p.scope} · {nameOf(p.assigned_to_id)}
                    </p>
                    <p className="mt-1 flex items-center gap-1 text-sm">
                      <CalendarClock className="h-4 w-4 text-nexo-muted" />
                      {p.is_active ? 'Próxima:' : 'Pausado. Próxima:'}{' '}
                      {new Date(p.next_due_at).toLocaleDateString('es-CO', { dateStyle: 'medium' })}
                      {p.lead_days ? <span className="text-xs text-nexo-muted">(se crea {p.lead_days} días antes)</span> : null}
                    </p>
                    {p.lastTicket && last ? (
                      <Link href={`/dashboard/solicitudes/${p.lastTicket.id}`} className="mt-1 inline-flex items-center gap-2 text-xs text-nexo-teal">
                        Última: {new Date(p.lastTicket.created_at).toLocaleDateString('es-CO')}
                        <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-medium', last.badge)}>{last.label}</span>
                      </Link>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" disabled={run.isPending} onClick={() => run.mutate(p.id)} title="Crear la solicitud ahora">
                      <Play className="h-4 w-4" /> Ejecutar ya
                    </Button>
                    <button onClick={() => toggle.mutate(p)} className="text-xs text-nexo-teal">
                      {p.is_active ? 'Pausar' : 'Activar'}
                    </button>
                    <button onClick={() => remove.mutate(p.id)} className="text-nexo-faint hover:text-red-600" aria-label={`Eliminar ${p.title}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </Card>
            );
          })}
          {run.isError ? <p className="text-xs text-red-600">{apiMessage(run.error)}</p> : null}
        </div>
      )}

      {open ? <PlanDialog team={team.data ?? []} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}

function PlanDialog({ team, onClose }: { team: Member[]; onClose: () => void }) {
  const api = useApi();
  const qc = useQueryClient();
  const units = useQuery({ queryKey: ['units'], queryFn: () => api.get<UnitRef[]>('/units') });
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [count, setCount] = useState('1');
  const [unit, setUnit] = useState<'DAY' | 'WEEK' | 'MONTH'>('MONTH');
  const [date, setDate] = useState(tomorrow);
  const [lead, setLead] = useState('0');
  const [priority, setPriority] = useState('P3');
  const [scope, setScope] = useState('FACILITY');
  const [assignee, setAssignee] = useState('');
  const [unitId, setUnitId] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.post('/operations/maintenance-plans', {
        title: title.trim(),
        description: description.trim() || null,
        intervalUnit: unit,
        intervalCount: Number(count),
        // 08:00 Colombia time on the chosen day.
        nextDueAt: `${date}T08:00:00-05:00`,
        leadDays: Number(lead),
        priority,
        scope,
        assignedToId: assignee || null,
        unitId: unitId || null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['maintenance-plans'] });
      onClose();
    },
  });
  const field = 'mt-1 h-10 w-full rounded-lg border border-nexo-border bg-white px-3 text-sm';
  return (
    <Dialog open onClose={onClose} title="Nuevo plan de mantenimiento">
      <div className="max-h-[70vh] space-y-3 overflow-auto pr-1">
        <label className="block text-sm font-medium">
          Tarea
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Limpieza de tanques de agua" className={field} />
        </label>
        <label className="block text-sm font-medium">
          Instrucciones (opcional)
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-nexo-border p-3 text-sm" />
        </label>
        <div className="grid grid-cols-3 gap-2">
          <label className="block text-sm font-medium">
            Cada
            <input type="number" min={1} value={count} onChange={(e) => setCount(e.target.value)} className={field} />
          </label>
          <label className="col-span-2 block text-sm font-medium">
            &nbsp;
            <select value={unit} onChange={(e) => setUnit(e.target.value as 'DAY' | 'WEEK' | 'MONTH')} className={field}>
              <option value="DAY">días</option>
              <option value="WEEK">semanas</option>
              <option value="MONTH">meses</option>
            </select>
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Primera vez
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={field} />
          </label>
          <label className="block text-sm font-medium">
            Crear con anticipación (días)
            <input type="number" min={0} max={60} value={lead} onChange={(e) => setLead(e.target.value)} className={field} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">
            Prioridad
            <select value={priority} onChange={(e) => setPriority(e.target.value)} className={field}>
              {['P1', 'P2', 'P3', 'P4'].map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm font-medium">
            Lugar
            <select value={scope} onChange={(e) => setScope(e.target.value)} className={field}>
              {Object.entries(SCOPE).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label className="block text-sm font-medium">
          Responsable
          <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={field}>
            <option value="">Según reglas de asignación</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
                {m.team ? ` · ${m.team}` : ''}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Unidad (opcional)
          <select value={unitId} onChange={(e) => setUnitId(e.target.value)} className={field}>
            <option value="">Zonas comunes / general</option>
            {(units.data ?? []).map((u) => (
              <option key={u.id} value={u.id}>
                {u.tower ? `${u.tower} · ` : ''}
                {u.unit_number}
              </option>
            ))}
          </select>
        </label>
        <Button variant="accent" className="w-full" disabled={!title.trim() || !date || create.isPending} onClick={() => create.mutate()}>
          {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Crear plan
        </Button>
        {create.isError ? <p className="text-xs text-red-600">{apiMessage(create.error)}</p> : null}
      </div>
    </Dialog>
  );
}
