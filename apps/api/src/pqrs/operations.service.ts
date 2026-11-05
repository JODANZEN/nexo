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
      select: { id: true, full_name: true, role: true, team: true, external_auth_id: true },
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
}
