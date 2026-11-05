'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell } from 'lucide-react';
import { useApi } from '@/lib/api';

// Persisted per-user feed from the API (Phase 17). Degrades to empty if the
// endpoint isn't reachable yet (e.g. before the backend is deployed).
interface Notif {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

function relative(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return 'ahora';
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export function NotificationsBell() {
  const api = useApi();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const q = useQuery({
    queryKey: ['notifications'],
    queryFn: () => api.get<Notif[]>('/notifications'),
    refetchInterval: 60_000,
  });
  const items = q.data ?? [];
  const unread = items.filter((n) => !n.read_at).length;

  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  });

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next && unread > 0) markAll.mutate();
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={toggle}
        className="relative flex h-9 w-9 items-center justify-center rounded-lg text-nexo-muted hover:bg-nexo-bg"
        aria-label="Notificaciones"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 ? (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-nexo-teal px-1 text-[9px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-xl border border-nexo-border bg-nexo-surface shadow-lg">
          <div className="border-b border-nexo-border px-4 py-3 text-sm font-semibold">Notificaciones</div>
          {items.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-nexo-muted">Sin novedades.</div>
          ) : (
            <ul className="max-h-96 divide-y divide-nexo-border overflow-y-auto">
              {items.map((n) => {
                const inner = (
                  <div className="flex gap-3 px-4 py-3 transition-colors hover:bg-nexo-bg">
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-nexo-teal'}`}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium">{n.title}</div>
                      {n.body ? <div className="text-xs text-nexo-muted">{n.body}</div> : null}
                    </div>
                    <span className="shrink-0 text-xs text-nexo-faint">{relative(n.created_at)}</span>
                  </div>
                );
                return (
                  <li key={n.id}>
                    {n.link ? (
                      <Link href={n.link} onClick={() => setOpen(false)}>
                        {inner}
                      </Link>
                    ) : (
                      inner
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
