'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from '@clerk/nextjs';
import { Loader2, CheckCircle2, Plus } from 'lucide-react';
import { useApi } from '@/lib/api';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { ASAMBLEA_STATUS } from '@/lib/asamblea-status';

interface AgendaItem {
  id: string;
  order: number;
  title: string;
  description?: string | null;
}
interface AsambleaDetail {
  id: string;
  title: string;
  status: keyof typeof ASAMBLEA_STATUS;
  quorum_reached_at: string | null;
  agenda_items: AgendaItem[];
  quorum: {
    requiredPct: string;
    attendingCoeficiente: string;
    totalCoeficiente: string;
    currentPct: string;
    reached: boolean;
  };
}
interface TallyEntry { value: string; coeficiente: string; pct: string }
interface ResultItem { agendaItemId: string; title: string; totalVotedCoeficiente: string; tally: TallyEntry[] }

const NEXT: Record<string, string[]> = {
  SCHEDULED: ['QUORUM_OPEN'],
  QUORUM_OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['VOTING_CLOSED', 'COMPLETED'],
  VOTING_CLOSED: ['COMPLETED'],
  COMPLETED: [],
  CANCELLED: [],
};
const VOTE_COLORS: Record<string, string> = { SI: 'bg-nexo-success', NO: 'bg-nexo-error', ABSTENCION: 'bg-nexo-faint' };

export default function AsambleaDetailPage() {
  const { id } = useParams<{ id: string }>();
  const api = useApi();
  const qc = useQueryClient();
  const { user } = useUser();
  const isAdmin = user?.publicMetadata?.role === 'ADMIN';

  // Refetch every 10s for live quorum + tallies.
  const detail = useQuery({
    queryKey: ['asamblea', id],
    queryFn: () => api.get<AsambleaDetail>(`/asambleas/${id}`),
    refetchInterval: 10_000,
  });
  const results = useQuery({
    queryKey: ['asamblea', id, 'results'],
    queryFn: () => api.get<{ items: ResultItem[] }>(`/asambleas/${id}/results`),
    refetchInterval: 10_000,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['asamblea', id] });
  };

  const attend = useMutation({ mutationFn: () => api.post(`/asambleas/${id}/attend`), onSuccess: invalidate });
  const setStatus = useMutation({
    mutationFn: (status: string) => api.patch(`/asambleas/${id}/status`, { status }),
    onSuccess: invalidate,
  });
  const vote = useMutation({
    mutationFn: (v: { itemId: string; voteValue: string }) =>
      api.post(`/asambleas/${id}/agenda/${v.itemId}/vote`, { voteValue: v.voteValue }),
    onSuccess: invalidate,
  });
  const addItem = useMutation({
    mutationFn: (body: { order: number; title: string }) => api.post(`/asambleas/${id}/agenda`, body),
    onSuccess: invalidate,
  });

  const [newItem, setNewItem] = useState('');

  if (detail.isLoading) {
    return (
      <div className="flex items-center gap-2 p-10 text-sm text-nexo-muted">
        <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
      </div>
    );
  }
  if (detail.isError || !detail.data) {
    return <p className="p-10 text-sm text-red-600">Error: {(detail.error as Error)?.message}</p>;
  }

  const a = detail.data;
  const st = ASAMBLEA_STATUS[a.status];
  const pct = Math.min(100, Number(a.quorum.currentPct));
  const tallyByItem = new Map((results.data?.items ?? []).map((it) => [it.agendaItemId, it]));
  const canAttend = a.status === 'QUORUM_OPEN' || a.status === 'IN_PROGRESS';
  const canVote = a.status === 'IN_PROGRESS';

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <a href="/dashboard/asambleas" className="text-sm text-nexo-muted hover:text-nexo-text">
        ← Volver a asambleas
      </a>

      <Card className="p-5">
        <div className="flex items-start justify-between gap-4">
          <h1 className="text-xl font-bold tracking-tight">{a.title}</h1>
          <span className={cn('shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium', st.badge)}>{st.label}</span>
        </div>

        {/* Live quorum bar */}
        <div className="mt-5">
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Quórum</span>
            <span className="text-nexo-muted">
              {Number(a.quorum.currentPct).toFixed(1)}% de {Number(a.quorum.requiredPct).toFixed(0)}% requerido
            </span>
          </div>
          <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-nexo-bg">
            <div
              className={cn('h-full rounded-full transition-all', a.quorum.reached ? 'bg-nexo-success' : 'bg-nexo-teal')}
              style={{ width: `${pct}%` }}
            />
          </div>
          {a.quorum.reached ? (
            <p className="mt-1.5 flex items-center gap-1 text-xs font-medium text-green-600">
              <CheckCircle2 className="h-3.5 w-3.5" /> Quórum alcanzado
            </p>
          ) : null}
        </div>

        {/* Controls */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-nexo-border pt-4">
          {canAttend ? (
            <Button variant="accent" size="sm" disabled={attend.isPending} onClick={() => attend.mutate()}>
              {attend.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Registrar asistencia'}
            </Button>
          ) : null}
          {isAdmin
            ? NEXT[a.status].map((s) => (
                <Button key={s} size="sm" variant="outline" disabled={setStatus.isPending} onClick={() => setStatus.mutate(s)}>
                  Avanzar a {ASAMBLEA_STATUS[s].label}
                </Button>
              ))
            : null}
        </div>
        {attend.isError ? <p className="mt-2 text-xs text-red-600">{(attend.error as Error).message}</p> : null}
        {setStatus.isError ? <p className="mt-2 text-xs text-red-600">{(setStatus.error as Error).message}</p> : null}
      </Card>

      {/* Agenda + results */}
      <Card className="p-5">
        <h2 className="text-base font-semibold tracking-tight">Orden del día</h2>
        <div className="mt-4 space-y-5">
          {a.agenda_items.length === 0 ? (
            <p className="text-sm text-nexo-muted">Sin puntos en el orden del día.</p>
          ) : (
            a.agenda_items.map((item) => {
              const tally = tallyByItem.get(item.id)?.tally ?? [];
              return (
                <div key={item.id}>
                  <div className="text-sm font-medium">
                    {item.order}. {item.title}
                  </div>

                  {/* Stacked weighted bar chart */}
                  <div className="mt-2 flex h-4 w-full overflow-hidden rounded-full bg-nexo-bg">
                    {tally.map((t) => (
                      <div
                        key={t.value}
                        className={VOTE_COLORS[t.value] ?? 'bg-nexo-faint'}
                        style={{ width: `${t.pct}%` }}
                        title={`${t.value} ${t.pct}%`}
                      />
                    ))}
                  </div>
                  <div className="mt-1.5 flex gap-4 text-xs text-nexo-muted">
                    {tally.map((t) => (
                      <span key={t.value}>
                        {t.value}: {Number(t.pct).toFixed(1)}%
                      </span>
                    ))}
                  </div>

                  {canVote ? (
                    <div className="mt-2 flex gap-2">
                      {['SI', 'NO', 'ABSTENCION'].map((v) => (
                        <Button
                          key={v}
                          size="sm"
                          variant="outline"
                          disabled={vote.isPending}
                          onClick={() => vote.mutate({ itemId: item.id, voteValue: v })}
                        >
                          {v}
                        </Button>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })
          )}
        </div>
        {vote.isError ? <p className="mt-3 text-xs text-red-600">{(vote.error as Error).message}</p> : null}

        {/* Admin: add agenda item */}
        {isAdmin ? (
          <div className="mt-5 flex gap-2 border-t border-nexo-border pt-4">
            <input
              value={newItem}
              onChange={(e) => setNewItem(e.target.value)}
              placeholder="Nuevo punto del orden del día"
              className="h-9 flex-1 rounded-lg border border-nexo-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-nexo-teal"
            />
            <Button
              size="sm"
              disabled={!newItem.trim() || addItem.isPending}
              onClick={() =>
                addItem.mutate(
                  { order: a.agenda_items.length + 1, title: newItem.trim() },
                  { onSuccess: () => setNewItem('') },
                )
              }
            >
              <Plus className="h-4 w-4" /> Agregar
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
