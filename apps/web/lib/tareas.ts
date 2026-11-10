import { SCOPE } from '@/lib/ticket-labels';

export interface Tarea {
  id: string;
  title: string;
  status: string;
  priority: string;
  scope: string;
  resolution_due_at: string | null;
  sla_breached: boolean;
  created_at: string;
  resolved_at: string | null;
  maintenance_plan_id: string | null;
  unit: { unit_number: string; tower: string | null } | null;
  assigned_to?: { id: string; full_name: string; team: string | null } | null;
}

/** Row of GET /operations/team. */
export interface TeamMember {
  id: string;
  name: string;
  role: string;
  team: string | null;
  isTeamLead: boolean;
  isMe: boolean;
  pending: boolean;
  openTickets: number;
}

/** Team labels are free text: compare trimmed and case-insensitively (same rule as the API). */
export function sameTeam(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = (a ?? '').trim().toLowerCase();
  return x !== '' && x === (b ?? '').trim().toLowerCase();
}

export const PRIO_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function where(t: Pick<Tarea, 'unit' | 'scope'>): string {
  if (t.unit) return `${t.unit.tower ? `${t.unit.tower} · ` : ''}Unidad ${t.unit.unit_number}`;
  return SCOPE[t.scope] ?? t.scope;
}

