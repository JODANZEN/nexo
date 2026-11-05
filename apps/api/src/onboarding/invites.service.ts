import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { OccupancyType, UserRole } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { normalizePhone } from '../auth/phone';

export type InviteRole = 'RESIDENT' | 'GUARD' | 'ADMIN' | 'STAFF';
export interface CreateInviteDto {
  phone: string;
  fullName?: string;
  role?: InviteRole;
  unitId?: string;
  occupancyType?: string;
  team?: string; // STAFF only: "Mantenimiento", "Aseo"…
}
export interface BulkInviteRow {
  unitNumber: string;
  phone: string;
  fullName?: string;
  occupancyType?: string;
}
export interface BulkResult {
  row: number;
  unitNumber: string;
  phone: string;
  status: 'invited' | 'skipped' | 'error';
  reason?: string;
}

const ROLES: InviteRole[] = ['RESIDENT', 'GUARD', 'ADMIN', 'STAFF'];
const MAX_BULK = 2000;

/**
 * Invitations = pending User rows (external_auth_id = null) keyed by phone.
 * The person signs in with SMS OTP; POST /users/provision matches their
 * Clerk-verified phone and claims the row (see OnboardingService.provision).
 */
@Injectable()
export class InvitesService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async list(user: AuthUser) {
    const conjuntoId = this.requireAdmin(user);
    const rows = await this.prisma.db.user.findMany({
      where: { conjunto_id: conjuntoId, external_auth_id: null, is_active: true },
      orderBy: { created_at: 'desc' },
      select: {
        id: true,
        full_name: true,
        phone: true,
        role: true,
        team: true,
        created_at: true,
        occupancies: {
          where: { ended_at: null },
          take: 1,
          select: { occupancy_type: true, unit: { select: { unit_number: true } } },
        },
      },
    });
    return rows.map((r) => ({
      id: r.id,
      fullName: r.full_name,
      phone: r.phone,
      role: r.role,
      team: r.team,
      unitNumber: r.occupancies[0]?.unit.unit_number ?? null,
      occupancyType: r.occupancies[0]?.occupancy_type ?? null,
      createdAt: r.created_at,
    }));
  }

  async create(user: AuthUser, dto: CreateInviteDto) {
    const conjuntoId = this.requireAdmin(user);
    return this.createOne(conjuntoId, dto);
  }

  async bulk(user: AuthUser, rows: BulkInviteRow[]): Promise<{ results: BulkResult[] }> {
    const conjuntoId = this.requireAdmin(user);
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('rows is required');
    if (rows.length > MAX_BULK) throw new BadRequestException(`Máximo ${MAX_BULK} filas por carga`);

    const units = await this.prisma.db.unit.findMany({
      where: { conjunto_id: conjuntoId },
      select: { id: true, unit_number: true },
    });
    const byNumber = new Map(units.map((u) => [u.unit_number.trim().toLowerCase(), u.id]));

    const results: BulkResult[] = [];
    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const unitNumber = String(r.unitNumber ?? '').trim();
      const phone = String(r.phone ?? '').trim();
      const base = { row: i + 1, unitNumber, phone };
      const unitId = byNumber.get(unitNumber.toLowerCase());
      if (!unitId) {
        results.push({ ...base, status: 'error', reason: 'Unidad no existe' });
        continue;
      }
      try {
        await this.createOne(conjuntoId, {
          phone,
          fullName: r.fullName,
          role: 'RESIDENT',
          unitId,
          occupancyType: r.occupancyType,
        });
        results.push({ ...base, status: 'invited' });
      } catch (err) {
        const reason = err instanceof Error ? err.message : 'Error';
        results.push({ ...base, status: err instanceof ConflictException ? 'skipped' : 'error', reason });
      }
    }
    return { results };
  }

  async revoke(user: AuthUser, inviteId: string) {
    const conjuntoId = this.requireAdmin(user);
    const row = await this.prisma.db.user.findUnique({ where: { id: inviteId } });
    if (!row || row.conjunto_id !== conjuntoId || row.external_auth_id) {
      throw new NotFoundException('Invitación no encontrada');
    }
    // Soft-revoke: keeps FK history intact; the claim path ignores inactive rows.
    await this.prisma.db.$transaction(async (tx) => {
      await tx.unitOccupancy.updateMany({
        where: { user_id: row.id, ended_at: null },
        data: { ended_at: new Date() },
      });
      await tx.user.update({ where: { id: row.id }, data: { is_active: false } });
    });
    return { id: row.id, revoked: true };
  }

  private async createOne(conjuntoId: string, dto: CreateInviteDto) {
    const role: InviteRole = dto.role ?? 'RESIDENT';
    if (!ROLES.includes(role)) throw new BadRequestException(`Rol inválido: ${dto.role}`);
    const raw = String(dto.phone ?? '').trim();
    if (!raw) throw new BadRequestException('Celular requerido');
    const phone = normalizePhone(raw);
    if (!/^\+\d{10,15}$/.test(phone)) throw new BadRequestException(`Celular inválido: ${raw}`);

    let occupancyType: OccupancyType | null = null;
    if (role === 'RESIDENT') {
      if (!dto.unitId) throw new BadRequestException('unitId es requerido para residentes');
      const unit = await this.prisma.db.unit.findUnique({
        where: { id: dto.unitId },
        select: { conjunto_id: true },
      });
      if (!unit || unit.conjunto_id !== conjuntoId) throw new BadRequestException('Unidad inválida');
      const t = String(dto.occupancyType ?? 'OWNER').toUpperCase();
      occupancyType = t in OccupancyType ? (t as OccupancyType) : OccupancyType.OWNER;
    }

    // Same phone already pending (or active) in this conjunto → don't duplicate.
    const dup = await this.prisma.db.user.findFirst({
      where: { conjunto_id: conjuntoId, phone, is_active: true },
      select: { id: true },
    });
    if (dup) throw new ConflictException('Ese celular ya está invitado o registrado');

    const created = await this.prisma.db.user.create({
      data: {
        conjunto_id: conjuntoId,
        phone,
        full_name:
          dto.fullName?.trim() ||
          ({ GUARD: 'Portería', ADMIN: 'Administrador', STAFF: 'Personal', RESIDENT: 'Residente' } as const)[role],
        role: role as UserRole,
        team: role === 'STAFF' ? dto.team?.trim().slice(0, 60) || null : null,
      },
    });
    if (role === 'RESIDENT' && dto.unitId && occupancyType) {
      await this.prisma.db.unitOccupancy.create({
        data: { unit_id: dto.unitId, user_id: created.id, occupancy_type: occupancyType, started_at: new Date() },
      });
    }
    return { id: created.id, phone, role, unitId: dto.unitId ?? null };
  }
}
