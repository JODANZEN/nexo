import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { PqrStatus, UserRole, type Prisma } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { resolveBusinessHours, resolveSla, type BusinessHours, type SlaConfig } from './sla';
import { ASSIGNABLE_ROLES } from './routing.service';

/** Ticket targets, business hours and the operations team of a conjunto. */
@Injectable()
export class OperationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Effective SLA + business hours (defaults merged). Works with or without a tenant. */
  async loadConfig(conjuntoId: string): Promise<{ sla: SlaConfig; businessHours: BusinessHours }> {
    const cj = await this.prisma.db.conjunto.findUnique({
      where: { id: conjuntoId },
      select: { sla_config: true, business_hours: true },
    });
    return { sla: resolveSla(cj?.sla_config), businessHours: resolveBusinessHours(cj?.business_hours) };
  }

  async getConfig(user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') throw new ForbiddenException();
    return this.loadConfig(user.conjuntoId);
  }

  async updateConfig(user: AuthUser, body: { sla?: unknown; businessHours?: unknown }) {
    if (user.role !== 'ADMIN' || !user.conjuntoId) throw new ForbiddenException();
    if (!body || (body.sla === undefined && body.businessHours === undefined)) {
      throw new BadRequestException('Nada que actualizar');
    }
    const data: Prisma.ConjuntoUpdateInput = {};
    // Store the normalized form so what we show is exactly what we enforce.
    if (body.sla !== undefined) data.sla_config = resolveSla(body.sla) as unknown as Prisma.InputJsonValue;
    if (body.businessHours !== undefined) {
      data.business_hours = resolveBusinessHours(body.businessHours) as unknown as Prisma.InputJsonValue;
    }
    await this.prisma.db.conjunto.update({ where: { id: user.conjuntoId }, data });
    // Applies to new tickets and priority changes; open tickets keep their due dates.
    return this.loadConfig(user.conjuntoId);
  }

  /** STAFF + ADMIN users with their open-ticket load (assignment pickers, routing UI). */
  async team(user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (user.role !== 'ADMIN' && user.role !== 'STAFF') throw new ForbiddenException();
    const people = await this.prisma.db.user.findMany({
      where: { conjunto_id: user.conjuntoId, is_active: true, role: { in: ASSIGNABLE_ROLES } },
      orderBy: [{ role: 'asc' }, { full_name: 'asc' }],
      select: { id: true, full_name: true, role: true, team: true, is_team_lead: true, external_auth_id: true },
    });
    const load = await this.prisma.db.pqr.groupBy({
      by: ['assigned_to_id'],
      where: {
        conjunto_id: user.conjuntoId,
        assigned_to_id: { in: people.map((p) => p.id) },
        status: { in: [PqrStatus.OPEN, PqrStatus.IN_REVIEW, PqrStatus.AWAITING_RESIDENT] },
      },
      _count: { _all: true },
    });
    const by = new Map(load.map((l) => [l.assigned_to_id, l._count._all]));
    return people.map((p) => ({
      id: p.id,
      name: p.full_name,
      role: p.role,
      team: p.team,
      isTeamLead: p.role === UserRole.STAFF && p.is_team_lead,
      isMe: p.external_auth_id === user.userId,
      pending: p.external_auth_id == null, // invited, hasn't signed in yet
      openTickets: by.get(p.id) ?? 0,
    }));
  }

  async setTeam(user: AuthUser, userId: string, team: string | null) {
    if (user.role !== 'ADMIN' || !user.conjuntoId) throw new ForbiddenException();
    const target = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!target || target.conjunto_id !== user.conjuntoId || target.role !== UserRole.STAFF) {
      throw new ForbiddenException();
    }
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { team: team?.trim().slice(0, 60) || null },
      select: { id: true, team: true },
    });
  }

  /** Jefe de área: only an ADMIN of the same conjunto can grant or remove it, and only on STAFF. */
  async setTeamLead(user: AuthUser, userId: string, isTeamLead: unknown) {
    if (user.role !== 'ADMIN' || !user.conjuntoId) throw new ForbiddenException();
    if (typeof isTeamLead !== 'boolean') throw new BadRequestException('isTeamLead debe ser true o false');
    const target = await this.prisma.db.user.findUnique({ where: { id: userId } });
    if (!target || target.conjunto_id !== user.conjuntoId || target.role !== UserRole.STAFF) {
      throw new ForbiddenException();
    }
    return this.prisma.db.user.update({
      where: { id: userId },
      data: { is_team_lead: isTeamLead },
      select: { id: true, team: true, is_team_lead: true },
    });
  }

  /**
   * Admin view by area: per team, tickets being worked (OPEN/IN_REVIEW), waiting on the
   * resident, and overdue (being worked and past the resolution target). Tickets held by
   * people without a team and unassigned tickets get their own rows. 4 queries, no N+1.
   */
  async teamSummary(user: AuthUser) {
    if (user.role !== 'ADMIN' || !user.conjuntoId) throw new ForbiddenException();
    const conjunto_id = user.conjuntoId;
    const working = [PqrStatus.OPEN, PqrStatus.IN_REVIEW];
    const [people, byStatus, overdue] = await Promise.all([
      this.prisma.db.user.findMany({
        where: { conjunto_id, role: { in: ASSIGNABLE_ROLES } },
        select: { id: true, role: true, team: true, is_active: true },
      }),
      this.prisma.db.pqr.groupBy({
        by: ['assigned_to_id', 'status'],
        where: { conjunto_id, status: { in: [...working, PqrStatus.AWAITING_RESIDENT] } },
        _count: { _all: true },
      }),
      this.prisma.db.pqr.groupBy({
        by: ['assigned_to_id'],
        where: {
          conjunto_id,
          status: { in: working },
          OR: [{ sla_breached: true }, { resolution_due_at: { lt: new Date() } }],
        },
        _count: { _all: true },
      }),
    ]);
    type Row = { key: string; team: string | null; kind: 'team' | 'no_team' | 'unassigned'; members: number; active: number; awaiting: number; overdue: number };
    const rows = new Map<string, Row>();
    const row = (key: string, team: string | null, kind: Row['kind']): Row => {
      let r = rows.get(key);
      if (!r) rows.set(key, (r = { key, team, kind, members: 0, active: 0, awaiting: 0, overdue: 0 }));
      return r;
    };
    const rowOf = new Map<string, Row>();
    for (const p of people) {
      const label = p.role === UserRole.STAFF ? p.team?.trim() : '';
      const r = label ? row(`team:${teamKey(label)}`, label, 'team') : row('no_team', null, 'no_team');
      if (p.is_active && label) r.members += 1;
      rowOf.set(p.id, r);
    }
    const target = (id: string | null) => (id ? rowOf.get(id) ?? row('no_team', null, 'no_team') : row('unassigned', null, 'unassigned'));
    for (const g of byStatus) {
      const r = target(g.assigned_to_id);
      if (g.status === PqrStatus.AWAITING_RESIDENT) r.awaiting += g._count._all;
      else r.active += g._count._all;
    }
    for (const g of overdue) target(g.assigned_to_id).overdue += g._count._all;
    const order = { team: 0, no_team: 1, unassigned: 2 };
    return [...rows.values()]
      .filter((r) => r.kind === 'team' || r.active + r.awaiting + r.overdue > 0)
      .sort((a, b) => order[a.kind] - order[b.kind] || (a.team ?? '').localeCompare(b.team ?? '', 'es'));
  }
}

/** Team labels are free text: compare them trimmed and case-insensitively. */
export function teamKey(team: string | null | undefined): string {
  return (team ?? '').trim().toLowerCase();
}
