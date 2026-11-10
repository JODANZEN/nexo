'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { ChevronRight, ClipboardCheck, MapPin, UserRound } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { PQR_STATUS } from '@/lib/status-badges';
import { PRIORITY, slaState } from '@/lib/ticket-labels';
import { PRIO_RANK, where, type Tarea, type TeamMember } from '@/lib/tareas';
import { cn } from '@/lib/utils';

export default function TareasPage() {
  const api = useApi();
  const { user } = useUser();
  const [tab, setTab] = useState<'ACTIVE' | 'TEAM' | 'RESOLVED'>('ACTIVE');
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';
  // Jefe de área (set by administración in Operación → Equipo) gets the "Mi equipo" tab.
  const roster = useQuery({
    queryKey: ['operations', 'team'],
    queryFn: () => api.get<TeamMember[]>('/operations/team'),
    enabled: !isAdmin,
    staleTime: 5 * 60_000,
  });
  const me = roster.data?.find((m) => m.isMe);
  const isLead = !!me?.isTeamLead && !!me.team?.trim();
  const tabs = isLead ? (['ACTIVE', 'TEAM', 'RESOLVED'] as const) : (['ACTIVE', 'RESOLVED'] as const);
  const q = useQuery({
    queryKey: ['tareas', tab],
    queryFn: () =>
      api.get<Tarea[]>(
        tab === 'TEAM' ? '/pqrs?status=ACTIVE&scope=team' : `/pqrs?status=${tab}${isAdmin ? '&assigned=me' : ''}`,
      ),
    refetchInterval: 60_000,
  });
  const open = tab !== 'RESOLVED';

  const rows = [...(q.data ?? [])].sort((a, b) =>
    open
      ? // Waiting-on-resident last; then by due date, then priority.
        Number(a.status === 'AWAITING_RESIDENT') - Number(b.status === 'AWAITING_RESIDENT') ||
        (a.resolution_due_at ? new Date(a.resolution_due_at).getTime() : Infinity) -
          (b.resolution_due_at ? new Date(b.resolution_due_at).getTime() : Infinity) ||
        PRIO_RANK[a.priority] - PRIO_RANK[b.priority]
      : new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime(),
  );
  const overdue = open ? rows.filter((r) => slaState(r).text === 'SLA vencido').length : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Hola{user?.firstName ? `, ${user.firstName}` : ''}</h1>
        <p className="text-sm text-nexo-muted">
          {open && q.data
            ? `${rows.length} ${tab === 'TEAM' ? `solicitud${rows.length === 1 ? '' : 'es'} activa${rows.length === 1 ? '' : 's'} en ${me?.team?.trim()}` : `tarea${rows.length === 1 ? '' : 's'} pendiente${rows.length === 1 ? '' : 's'}`}${overdue ? ` · ${overdue} vencida${overdue === 1 ? '' : 's'}` : ''}`
            : 'Tus tareas asignadas'}
        </p>
      </div>

      <div className={cn('grid rounded-xl bg-nexo-border/60 p-1 text-sm font-medium', isLead ? 'grid-cols-3' : 'grid-cols-2')}>
        {tabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn('rounded-lg py-2', tab === t ? 'bg-white shadow-sm' : 'text-nexo-muted')}
            aria-pressed={tab === t}
          >
            {t === 'ACTIVE' ? 'Pendientes' : t === 'TEAM' ? 'Mi equipo' : 'Resueltas'}
          </button>
        ))}
      </div>

      {q.isLoading ? (
        <Skeleton rows={4} />
      ) : q.isError ? (
        <ErrorState error={q.error} />
      ) : rows.length === 0 ? (
        <Card>
          <EmptyState icon={<ClipboardCheck className="h-6 w-6" />}>
            {tab === 'ACTIVE'
              ? 'No tienes tareas pendientes.'
              : tab === 'TEAM'
                ? 'Tu equipo no tiene solicitudes activas.'
                : 'Aún no has resuelto tareas.'}
          </EmptyState>
        </Card>
      ) : (
        <ul className="space-y-2">
          {rows.map((t) => {
            const sla = slaState(t);
            const st = PQR_STATUS[t.status];
            return (
              <li key={t.id}>
                <Link href={`/tareas/${t.id}`} className="block">
                  <Card className="flex items-center gap-3 p-4 active:bg-nexo-bg">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', PRIORITY[t.priority]?.badge)}>
                          {t.priority}
                        </span>
                        {t.maintenance_plan_id ? <span className="text-[11px] font-medium text-nexo-muted">Preventivo</span> : null}
                        <span className={cn('ml-auto rounded-full px-2 py-0.5 text-[11px] font-medium', st?.badge)}>{st?.label}</span>
                      </div>
                      <p className="mt-1 truncate font-medium">{t.title}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-xs text-nexo-muted">
                        <MapPin className="h-3 w-3" /> {where(t)}
                        {sla.text ? <span className={cn('ml-auto', sla.cls)}>{sla.text}</span> : null}
                      </p>
                      {tab === 'TEAM' ? (
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-nexo-muted">
                          <UserRound className="h-3 w-3" />
                          {t.assigned_to ? (t.assigned_to.id === me?.id ? 'La tienes tú' : `La tiene ${t.assigned_to.full_name}`) : 'Sin responsable'}
                        </p>
                      ) : null}
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-nexo-faint" />
                  </Card>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
