'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2 } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { PQR_STATUS, PQR_CATEGORY } from '@/lib/status-badges';
import { PRIORITY, SCOPE, slaState } from '@/lib/ticket-labels';
import { sameTeam, type TeamMember } from '@/lib/tareas';
import { cn } from '@/lib/utils';

interface Pqr {
  id: string;
  title: string;
  description: string;
  category: string;
  status: string;
  priority: string;
  scope: string;
  resolution_due_at: string | null;
  sla_breached: boolean;
  created_at: string;
  assigned_to?: { id: string; full_name: string; team: string | null } | null;
}
/** Row of GET /operations/team-summary (admin). */
interface TeamRow {
  key: string;
  team: string | null;
  kind: 'team' | 'no_team' | 'unassigned';
  members: number;
  active: number;
  awaiting: number;
  overdue: number;
}
const selectCls =
  'h-9 rounded-lg border border-nexo-border bg-white px-2 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal';

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function SolicitudesPage() {
  const api = useApi();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  // Admin view by area: filter by team and by responsable ('none' = sin asignar).
  const [team, setTeam] = useState('');
  const [assignee, setAssignee] = useState('');
  const params = new URLSearchParams();
  if (team) params.set('team', team);
  if (assignee) params.set('assignee', assignee);
  const qs = params.toString();
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['pqrs', team, assignee],
    queryFn: () => api.get<Pqr[]>(`/pqrs${qs ? `?${qs}` : ''}`),
  });
  const summary = useQuery({
    queryKey: ['operations', 'team-summary'],
    queryFn: () => api.get<TeamRow[]>('/operations/team-summary'),
    enabled: isAdmin,
  });
  const members = useQuery({
    queryKey: ['operations', 'team'],
    queryFn: () => api.get<TeamMember[]>('/operations/team'),
    enabled: isAdmin,
  });
  const teams = (summary.data ?? []).filter((t) => t.kind === 'team');
  const people = (members.data ?? []).filter((m) => !team || sameTeam(m.team, team));
  const filtered = team !== '' || assignee !== '';
  const pickTeam = (value: string) => {
    setTeam(value);
    // Keep the person only if they belong to the chosen team.
    const who = members.data?.find((m) => m.id === assignee);
    if (value && (!who || !sameTeam(who.team, value))) setAssignee('');
  };
  const pickRow = (row: TeamRow) => {
    if (row.kind === 'team') {
      setAssignee('');
      setTeam(sameTeam(team, row.team) ? '' : row.team ?? '');
    } else if (row.kind === 'unassigned') {
      setTeam('');
      setAssignee(assignee === 'none' ? '' : 'none');
    }
  };

  const rows = data ?? [];
  const active = rows.filter((p) => p.status === 'OPEN' || p.status === 'IN_REVIEW');
  const awaiting = rows.filter((p) => p.status === 'AWAITING_RESIDENT');
  const breached = rows.filter((p) => p.sla_breached && p.status !== 'CLOSED');

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Solicitudes</h1>
        <p className="mt-1 text-sm text-nexo-muted">Tickets (PQR) con prioridad y SLA.</p>
      </div>

      {isAdmin && (summary.data?.length ?? 0) > 0 ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-nexo-border text-left text-xs text-nexo-muted">
                <th className="px-5 py-2.5 font-medium">Equipo</th>
                <th className="px-3 py-2.5 text-right font-medium">Activas</th>
                <th className="px-3 py-2.5 text-right font-medium">Esperando residente</th>
                <th className="px-5 py-2.5 text-right font-medium">Vencidas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-nexo-border">
              {summary.data!.map((row) => {
                const selected = row.kind === 'team' ? sameTeam(team, row.team) : row.kind === 'unassigned' && assignee === 'none';
                const label =
                  row.kind === 'team' ? row.team : row.kind === 'unassigned' ? 'Sin asignar' : 'Sin equipo (administración u otros)';
                return (
                  <tr key={row.key} className={cn(selected && 'bg-nexo-teal/10')}>
                    <td className="px-5 py-2.5">
                      {row.kind === 'no_team' ? (
                        <span className="text-nexo-muted">{label}</span>
                      ) : (
                        <button onClick={() => pickRow(row)} className="font-medium hover:text-nexo-teal" aria-pressed={selected}>
                          {label}
                        </button>
                      )}
                      {row.kind === 'team' ? (
                        <span className="ml-2 text-xs text-nexo-muted">
                          {row.members} persona{row.members === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{row.active}</td>
                    <td className={cn('px-3 py-2.5 text-right tabular-nums', row.awaiting > 0 && 'text-purple-600')}>{row.awaiting}</td>
                    <td className={cn('px-5 py-2.5 text-right tabular-nums', row.overdue > 0 && 'font-semibold text-red-600')}>
                      {row.overdue}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <span className="text-nexo-muted">Equipo</span>
            <select value={team} onChange={(e) => pickTeam(e.target.value)} className={selectCls}>
              <option value="">Todos</option>
              {teams.map((t) => (
                <option key={t.key} value={t.team ?? ''}>
                  {t.team}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2">
            <span className="text-nexo-muted">Responsable</span>
            <select value={assignee} onChange={(e) => setAssignee(e.target.value)} className={selectCls}>
              <option value="">Todos</option>
              {team ? null : <option value="none">Sin asignar</option>}
              {people.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.team ? ` · ${m.team}` : m.role === 'ADMIN' ? ' · Admin' : ''}
                </option>
              ))}
            </select>
          </label>
          {filtered ? (
            <button
              onClick={() => {
                setTeam('');
                setAssignee('');
              }}
              className="text-xs text-nexo-teal"
            >
              Quitar filtros
            </button>
          ) : null}
        </div>
      ) : null}

      {rows.length > 0 ? (
        <section className="grid grid-cols-3 gap-4">
          <Stat label="Activas" value={active.length} />
          <Stat label="Esperando residente" value={awaiting.length} accent="text-purple-600" />
          <Stat label="SLA incumplido" value={breached.length} accent={breached.length ? 'text-red-600' : undefined} />
        </section>
      ) : null}

      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-nexo-muted">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando solicitudes…
          </div>
        ) : isError ? (
          <div className="p-10 text-center text-sm text-red-600">Error al cargar: {(error as Error).message}</div>
        ) : rows.length === 0 ? (
          <div className="p-10 text-center text-sm text-nexo-muted">
            {filtered ? 'Ninguna solicitud con estos filtros.' : 'Sin solicitudes aún.'}
          </div>
        ) : (
          <ul className="divide-y divide-nexo-border">
            {rows.map((pqr) => {
              const st = PQR_STATUS[pqr.status] ?? { label: pqr.status, badge: 'bg-gray-100 text-gray-600' };
              const pr = PRIORITY[pqr.priority] ?? { label: pqr.priority, badge: 'bg-gray-100 text-gray-600' };
              const sla = slaState(pqr);
              return (
                <li key={pqr.id}>
                  <Link
                    href={`/dashboard/solicitudes/${pqr.id}`}
                    className="flex items-start justify-between gap-4 px-5 py-4 transition-colors hover:bg-nexo-bg"
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', pr.badge)}>{pr.label}</span>
                        <span className="font-medium">{pqr.title}</span>
                        <span className="text-xs text-nexo-muted">
                          {SCOPE[pqr.scope] ?? pqr.scope} · {PQR_CATEGORY[pqr.category] ?? pqr.category}
                        </span>
                      </div>
                      <p className="mt-0.5 truncate text-sm text-nexo-muted">{pqr.description}</p>
                      <p className="mt-1 text-xs">
                        <span className="text-nexo-muted">{fmtDate(pqr.created_at)}</span>
                        {isAdmin ? (
                          <span className="ml-2 text-nexo-muted">
                            ·{' '}
                            {pqr.assigned_to
                              ? `${pqr.assigned_to.full_name}${pqr.assigned_to.team ? ` (${pqr.assigned_to.team})` : ''}`
                              : 'Sin asignar'}
                          </span>
                        ) : null}
                        {sla.text ? <span className={cn('ml-2', sla.cls)}>· {sla.text}</span> : null}
                      </p>
                    </div>
                    <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>{st.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <Card className="p-4">
      <div className="text-sm text-nexo-muted">{label}</div>
      <div className={cn('mt-1 text-2xl font-bold', accent ?? 'text-nexo-text')}>{value}</div>
    </Card>
  );
}
