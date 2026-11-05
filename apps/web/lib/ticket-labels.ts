// Phase 17 ticket UI labels + SLA helper.

export const PRIORITY: Record<string, { label: string; badge: string }> = {
  P1: { label: 'P1 · Crítica', badge: 'bg-red-100 text-red-700' },
  P2: { label: 'P2 · Alta', badge: 'bg-orange-100 text-orange-700' },
  P3: { label: 'P3 · Normal', badge: 'bg-blue-50 text-blue-700' },
  P4: { label: 'P4 · Baja', badge: 'bg-gray-100 text-gray-600' },
};

export const SCOPE: Record<string, string> = {
  IN_UNIT: 'En apartamento',
  FACILITY: 'Instalaciones',
  INTERNAL_OPS: 'Interno',
};

/** SLA countdown/breach label for a ticket's resolution due date. */
export function slaState(input: {
  status: string;
  resolution_due_at: string | null;
  sla_breached: boolean;
}): { text: string; cls: string } {
  if (input.status === 'RESOLVED' || input.status === 'CLOSED') {
    return { text: input.sla_breached ? 'Cerrada · SLA incumplido' : 'Cerrada a tiempo', cls: input.sla_breached ? 'text-red-600' : 'text-green-600' };
  }
  if (input.status === 'AWAITING_RESIDENT') {
    return { text: 'SLA en pausa', cls: 'text-purple-600' };
  }
  if (!input.resolution_due_at) return { text: '', cls: 'text-nexo-muted' };
  const ms = new Date(input.resolution_due_at).getTime() - Date.now();
  if (ms <= 0) return { text: 'SLA vencido', cls: 'text-red-600 font-medium' };
  const h = Math.floor(ms / 3_600_000);
  const label = h >= 24 ? `${Math.floor(h / 24)}d ${h % 24}h` : h >= 1 ? `${h}h` : `${Math.floor(ms / 60000)}m`;
  return { text: `Vence en ${label}`, cls: ms < 3_600_000 ? 'text-orange-600' : 'text-nexo-muted' };
}
