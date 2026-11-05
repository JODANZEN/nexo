import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PqrCategory, PqrPriority, PqrScope, type MaintenancePlan, type Prisma } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { PqrsService } from './pqrs.service';
import { ASSIGNABLE_ROLES } from './routing.service';

export interface MaintenancePlanDto {
  title?: string;
  description?: string | null;
  scope?: string;
  priority?: string;
  unitId?: string | null;
  assignedToId?: string | null;
  intervalUnit?: string; // DAY | WEEK | MONTH
  intervalCount?: number;
  nextDueAt?: string; // ISO
  leadDays?: number;
  isActive?: boolean;
}

const UNITS = ['DAY', 'WEEK', 'MONTH'] as const;
type IntervalUnit = (typeof UNITS)[number];
const DAY_MS = 86_400_000;

/** Next occurrence after `from`. Months keep the day-of-month, clamped (31 → 30/28). */
export function advance(from: Date, unit: IntervalUnit, count: number): Date {
  if (unit === 'DAY') return new Date(from.getTime() + count * DAY_MS);
  if (unit === 'WEEK') return new Date(from.getTime() + count * 7 * DAY_MS);
  // Month math in Colombia time (UTC-5, no DST) so "día 1 a las 8:00" stays put.
  const local = new Date(from.getTime() - 5 * 3_600_000);
  const day = local.getUTCDate();
  const target = new Date(local);
  target.setUTCDate(1);
  target.setUTCMonth(target.getUTCMonth() + count);
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, last));
  return new Date(target.getTime() + 5 * 3_600_000);
}

/**
 * Preventive maintenance: recurring plans become tickets (category MAINTENANCE)
 * `lead_days` before they're due, assigned explicitly or by routing rules, with the
 * normal SLA. A daily cron does it; admins can also run a plan now.
 */
@Injectable()
export class MaintenanceService {
  private readonly logger = new Logger(MaintenanceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pqrs: PqrsService,
  ) {}

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async list(user: AuthUser) {
    const conjuntoId = this.requireAdmin(user);
    const plans = await this.prisma.db.maintenancePlan.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: [{ is_active: 'desc' }, { next_due_at: 'asc' }],
      include: {
        pqrs: { orderBy: { created_at: 'desc' }, take: 1, select: { id: true, status: true, created_at: true } },
      },
    });
    return plans.map(({ pqrs, ...p }) => ({ ...p, lastTicket: pqrs[0] ?? null }));
  }

  private async validate(conjuntoId: string, dto: MaintenancePlanDto, partial: boolean) {
    const data: Partial<Prisma.MaintenancePlanUncheckedCreateInput> = {};
    if (dto.title !== undefined || !partial) {
      const t = dto.title?.trim();
      if (!t) throw new BadRequestException('El título es obligatorio');
      data.title = t.slice(0, 200);
    }
    if (dto.description !== undefined) data.description = dto.description?.trim().slice(0, 2000) || null;
    if (dto.scope !== undefined) {
      if (!(dto.scope in PqrScope)) throw new BadRequestException('Tipo inválido');
      data.scope = dto.scope as PqrScope;
    }
    if (dto.priority !== undefined) {
      if (!(dto.priority in PqrPriority)) throw new BadRequestException('Prioridad inválida');
      data.priority = dto.priority as PqrPriority;
    }
    if (dto.intervalUnit !== undefined || !partial) {
      if (!UNITS.includes(dto.intervalUnit as IntervalUnit)) throw new BadRequestException('Frecuencia inválida');
      data.interval_unit = dto.intervalUnit;
    }
    if (dto.intervalCount !== undefined || !partial) {
      const n = Number(dto.intervalCount ?? 1);
      if (!Number.isInteger(n) || n < 1 || n > 365) throw new BadRequestException('Cada cuánto: entre 1 y 365');
      data.interval_count = n;
    }
    if (dto.leadDays !== undefined) {
      const n = Number(dto.leadDays);
      if (!Number.isInteger(n) || n < 0 || n > 60) throw new BadRequestException('Anticipación: 0 a 60 días');
      data.lead_days = n;
    }
    if (dto.nextDueAt !== undefined || !partial) {
      const d = new Date(dto.nextDueAt ?? '');
      if (Number.isNaN(d.getTime())) throw new BadRequestException('Fecha de la próxima ejecución inválida');
      data.next_due_at = d;
    }
    if (dto.unitId !== undefined) {
      if (dto.unitId) {
        const u = await this.prisma.db.unit.findUnique({ where: { id: dto.unitId }, select: { conjunto_id: true } });
        if (!u || u.conjunto_id !== conjuntoId) throw new BadRequestException('Unidad inválida');
      }
      data.unit_id = dto.unitId || null;
    }
    if (dto.assignedToId !== undefined) {
      if (dto.assignedToId) {
        const u = await this.prisma.db.user.findUnique({ where: { id: dto.assignedToId } });
        if (!u || u.conjunto_id !== conjuntoId || !ASSIGNABLE_ROLES.includes(u.role)) {
          throw new BadRequestException('Responsable inválido');
        }
      }
      data.assigned_to_id = dto.assignedToId || null;
    }
    if (dto.isActive !== undefined) data.is_active = !!dto.isActive;
    return data;
  }

  async create(user: AuthUser, dto: MaintenancePlanDto) {
    const conjuntoId = this.requireAdmin(user);
    const data = await this.validate(conjuntoId, dto, false);
    const me = await this.prisma.db.user.findUnique({ where: { external_auth_id: user.userId } });
    if (!me) throw new NotFoundException('User not provisioned');
    return this.prisma.db.maintenancePlan.create({
      data: { ...(data as Prisma.MaintenancePlanUncheckedCreateInput), conjunto_id: conjuntoId, created_by_id: me.id },
    });
  }

  async update(user: AuthUser, id: string, dto: MaintenancePlanDto) {
    const conjuntoId = this.requireAdmin(user);
    const plan = await this.prisma.db.maintenancePlan.findUnique({ where: { id } });
    if (!plan || plan.conjunto_id !== conjuntoId) throw new NotFoundException();
    const data = await this.validate(conjuntoId, dto, true);
    return this.prisma.db.maintenancePlan.update({ where: { id }, data });
  }

  async remove(user: AuthUser, id: string) {
    const conjuntoId = this.requireAdmin(user);
    const plan = await this.prisma.db.maintenancePlan.findUnique({ where: { id } });
    if (!plan || plan.conjunto_id !== conjuntoId) throw new NotFoundException();
    // Tickets already generated stay (FK is SET NULL).
    await this.prisma.db.maintenancePlan.delete({ where: { id } });
    return { id, deleted: true };
  }

  /** Generate this occurrence now (also advances the schedule). */
  async runNow(user: AuthUser, id: string) {
    const conjuntoId = this.requireAdmin(user);
    const plan = await this.prisma.db.maintenancePlan.findUnique({ where: { id } });
    if (!plan || plan.conjunto_id !== conjuntoId) throw new NotFoundException();
    const pqr = await this.generate(plan);
    if (!pqr) throw new BadRequestException('Otro proceso generó esta ejecución; recarga');
    return pqr;
  }

  // 05:30 COT daily. Runs without a tenant (system), across all conjuntos.
  @Cron('30 5 * * *', { timeZone: 'America/Bogota' })
  async generateDue(now = new Date()): Promise<number> {
    if (process.env.MAINTENANCE_CRON_ENABLED === 'false') return 0;
    // Candidates: due within the largest allowed lead time; exact check per plan.
    const plans = await this.prisma.db.maintenancePlan.findMany({
      where: { is_active: true, next_due_at: { lte: new Date(now.getTime() + 60 * DAY_MS) } },
      take: 2000,
    });
    let created = 0;
    for (const plan of plans) {
      if (plan.next_due_at.getTime() - plan.lead_days * DAY_MS > now.getTime()) continue;
      try {
        if (await this.generate(plan)) created++;
      } catch (err) {
        this.logger.error(`maintenance plan ${plan.id} failed: ${String(err)}`);
      }
    }
    if (created) this.logger.log(`preventive maintenance: ${created} ticket(s) created`);
    return created;
  }

  /**
   * Claim the occurrence by advancing next_due_at with a conditional update
   * (idempotent across overlapping runs / instances), then create the ticket.
   */
  private async generate(plan: MaintenancePlan) {
    const unit = plan.interval_unit as IntervalUnit;
    let next = advance(plan.next_due_at, unit, plan.interval_count);
    // A long-paused plan shouldn't spawn a ticket per missed period: skip to the future.
    for (let i = 0; i < 500 && next.getTime() <= Date.now(); i++) next = advance(next, unit, plan.interval_count);
    const claimed = await this.prisma.db.maintenancePlan.updateMany({
      where: { id: plan.id, next_due_at: plan.next_due_at },
      data: { next_due_at: next, last_generated_at: new Date() },
    });
    if (claimed.count === 0) return null;
    const assignee = plan.assigned_to_id
      ? await this.prisma.db.user.findUnique({ where: { id: plan.assigned_to_id }, select: { id: true, is_active: true } })
      : null;
    const due = plan.next_due_at.toLocaleDateString('es-CO', { timeZone: 'America/Bogota', dateStyle: 'long' });
    return this.pqrs.createInternal({
      conjuntoId: plan.conjunto_id,
      submittedById: plan.created_by_id,
      unitId: plan.unit_id,
      category: PqrCategory.MAINTENANCE,
      priority: plan.priority,
      scope: plan.scope,
      title: `Mantenimiento preventivo: ${plan.title}`,
      description: `${plan.description ? `${plan.description}\n\n` : ''}Programado para el ${due}. Generado automáticamente por el plan de mantenimiento.`,
      assignedToId: assignee?.is_active ? assignee.id : null,
      maintenancePlanId: plan.id,
    });
  }
}
