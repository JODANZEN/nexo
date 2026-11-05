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
}

export const PRIO_RANK: Record<string, number> = { P1: 0, P2: 1, P3: 2, P4: 3 };

export function where(t: Pick<Tarea, 'unit' | 'scope'>): string {
  if (t.unit) return `${t.unit.tower ? `${t.unit.tower} · ` : ''}Unidad ${t.unit.unit_number}`;
  return SCOPE[t.scope] ?? t.scope;
}

