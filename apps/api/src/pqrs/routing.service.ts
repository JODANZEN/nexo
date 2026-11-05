import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PqrCategory, PqrScope, PqrStatus, UserRole, type PqrRoutingRule } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface RoutingRuleDto {
  name?: string;
  category?: string | null;
  scope?: string | null;
  assigneeIds?: string[];
  sortOrder?: number;
  isActive?: boolean;
}

/** People who can work tickets. */
export const ASSIGNABLE_ROLES: UserRole[] = [UserRole.STAFF, UserRole.ADMIN];
const OPEN_STATUSES: PqrStatus[] = [PqrStatus.OPEN, PqrStatus.IN_REVIEW, PqrStatus.AWAITING_RESIDENT];

/**
 * Auto-assignment. The first active rule (lowest sort_order) whose category and
 * scope match (null = any) wins; among its active candidates the one with the
 * fewest open tickets gets it (ties → fewest assigned overall, then rule order),
 * which spreads work like a round-robin without shared cursor state.
 */
@Injectable()
export class RoutingService {
  constructor(private readonly prisma: PrismaService) {}

  async pickAssignee(conjuntoId: string, category: PqrCategory, scope: PqrScope): Promise<string | null> {
    const rules = await this.prisma.db.pqrRoutingRule.findMany({
      where: { conjunto_id: conjuntoId, is_active: true },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
    for (const rule of rules) {
      if (rule.category && rule.category !== category) continue;
      if (rule.scope && rule.scope !== scope) continue;
      const pick = await this.leastLoaded(conjuntoId, rule.assignee_ids);
      if (pick) return pick;
    }
    return null;
  }

  private async leastLoaded(conjuntoId: string, ids: string[]): Promise<string | null> {
    if (!ids.length) return null;
    const active = await this.prisma.db.user.findMany({
      where: { id: { in: ids }, conjunto_id: conjuntoId, is_active: true, role: { in: ASSIGNABLE_ROLES } },
      select: { id: true },
    });
    if (!active.length) return null;
    const activeIds = active.map((u) => u.id);
    const [open, total] = await Promise.all([
      this.prisma.db.pqr.groupBy({
        by: ['assigned_to_id'],
        where: { conjunto_id: conjuntoId, assigned_to_id: { in: activeIds }, status: { in: OPEN_STATUSES } },
        _count: { _all: true },
      }),
      this.prisma.db.pqr.groupBy({
        by: ['assigned_to_id'],
        where: { conjunto_id: conjuntoId, assigned_to_id: { in: activeIds } },
        _count: { _all: true },
      }),
    ]);
    const openBy = new Map(open.map((r) => [r.assigned_to_id, r._count._all]));
    const totalBy = new Map(total.map((r) => [r.assigned_to_id, r._count._all]));
    const order = ids.filter((id) => activeIds.includes(id));
    return order.sort(
      (a, b) =>
        (openBy.get(a) ?? 0) - (openBy.get(b) ?? 0) ||
        (totalBy.get(a) ?? 0) - (totalBy.get(b) ?? 0) ||
        order.indexOf(a) - order.indexOf(b),
    )[0];
  }

  // ── Admin CRUD ─────────────────────────────────────────────────────────────

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async list(user: AuthUser): Promise<PqrRoutingRule[]> {
    const conjuntoId = this.requireAdmin(user);
    return this.prisma.db.pqrRoutingRule.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  private async validate(conjuntoId: string, dto: RoutingRuleDto) {
    const category = dto.category ? (dto.category in PqrCategory ? (dto.category as PqrCategory) : null) : null;
    if (dto.category && !category) throw new BadRequestException('Categoría inválida');
    const scope = dto.scope ? (dto.scope in PqrScope ? (dto.scope as PqrScope) : null) : null;
    if (dto.scope && !scope) throw new BadRequestException('Tipo inválido');
    const ids = [...new Set(dto.assigneeIds ?? [])];
    if (ids.length > 50) throw new BadRequestException('Máximo 50 responsables por regla');
    if (ids.length) {
      const ok = await this.prisma.db.user.count({
        where: { id: { in: ids }, conjunto_id: conjuntoId, role: { in: ASSIGNABLE_ROLES } },
      });
      if (ok !== ids.length) throw new BadRequestException('Responsable inválido');
    }
    return { category, scope, ids };
  }

  async create(user: AuthUser, dto: RoutingRuleDto) {
    const conjuntoId = this.requireAdmin(user);
    const { category, scope, ids } = await this.validate(conjuntoId, dto);
    if (!ids.length) throw new BadRequestException('Elige al menos un responsable');
    return this.prisma.db.pqrRoutingRule.create({
      data: {
        conjunto_id: conjuntoId,
        name: dto.name?.trim().slice(0, 80) || 'Regla',
        category,
        scope,
        assignee_ids: ids,
        sort_order: Number.isInteger(dto.sortOrder) ? dto.sortOrder! : 100,
        is_active: dto.isActive ?? true,
      },
    });
  }

  async update(user: AuthUser, id: string, dto: RoutingRuleDto) {
    const conjuntoId = this.requireAdmin(user);
    const rule = await this.prisma.db.pqrRoutingRule.findUnique({ where: { id } });
    if (!rule || rule.conjunto_id !== conjuntoId) throw new NotFoundException();
    const v = await this.validate(conjuntoId, dto);
    return this.prisma.db.pqrRoutingRule.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim().slice(0, 80) || rule.name } : {}),
        ...(dto.category !== undefined ? { category: v.category } : {}),
        ...(dto.scope !== undefined ? { scope: v.scope } : {}),
        ...(dto.assigneeIds !== undefined ? { assignee_ids: v.ids } : {}),
        ...(Number.isInteger(dto.sortOrder) ? { sort_order: dto.sortOrder } : {}),
        ...(dto.isActive !== undefined ? { is_active: dto.isActive } : {}),
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    const conjuntoId = this.requireAdmin(user);
    const rule = await this.prisma.db.pqrRoutingRule.findUnique({ where: { id } });
    if (!rule || rule.conjunto_id !== conjuntoId) throw new NotFoundException();
    await this.prisma.db.pqrRoutingRule.delete({ where: { id } });
    return { id, deleted: true };
  }
}
