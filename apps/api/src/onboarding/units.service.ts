import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { Decimal } from 'decimal.js';
import { Prisma } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface UnitInput {
  unitNumber: string;
  tower?: string | null;
  floor?: number | string | null;
  roomType?: string | null; // room type NAME (created if missing)
  roomTypeId?: string | null;
  monthlyFee?: number | string | null;
  coeficiente?: number | string | null;
  isCommercial?: boolean;
}
export interface UnitImportResult {
  row: number;
  unitNumber: string;
  status: 'created' | 'updated' | 'unchanged' | 'error';
  reason?: string;
}

const MAX_IMPORT = 3000;

function clean(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s ? s : null;
}

// "350.000" / "$ 350.000" / "350000" / "350000.50" → Decimal. Colombian thousands dots.
export function parseMoney(v: unknown): Decimal | null {
  const s = clean(v);
  if (!s) return null;
  let t = s.replace(/[$\s]/g, '');
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(t)) t = t.replace(/\./g, '').replace(',', '.');
  else if (/^\d+(,\d{1,2})$/.test(t)) t = t.replace(',', '.');
  else t = t.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`valor inválido: ${s}`);
  return new Decimal(t);
}

function parseDecimal(v: unknown): Decimal | null {
  const s = clean(v);
  if (!s) return null;
  const t = s.replace('%', '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(t)) throw new Error(`coeficiente inválido: ${s}`);
  return new Decimal(t);
}

function parseFloor(v: unknown): number | null {
  const s = clean(v);
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`piso inválido: ${s}`);
  return n;
}

/** Units (apartments / rooms): create one, bulk import from CSV, edit. Admin only. */
@Injectable()
export class UnitsService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async createOne(user: AuthUser, dto: UnitInput) {
    const { results } = await this.bulk(user, [dto], { updateExisting: false });
    const r = results[0];
    if (r.status === 'error') throw new BadRequestException(r.reason);
    if (r.status !== 'created') throw new BadRequestException('Ya existe una unidad con ese número');
    return this.prisma.db.unit.findFirst({
      where: { conjunto_id: user.conjuntoId!, unit_number: r.unitNumber },
    });
  }

  /**
   * Upsert by unit_number. Missing room types (by name) are created. Fee defaults to
   * the room type's base_fee. One interactive transaction (RLS-scoped) so 1,500 rows
   * cost a handful of round trips instead of thousands.
   */
  async bulk(user: AuthUser, rows: UnitInput[], opts: { updateExisting?: boolean } = {}) {
    const conjuntoId = this.requireAdmin(user);
    if (!Array.isArray(rows) || rows.length === 0) throw new BadRequestException('rows is required');
    if (rows.length > MAX_IMPORT) throw new BadRequestException(`Máximo ${MAX_IMPORT} filas por carga`);
    const updateExisting = opts.updateExisting ?? true;

    return this.prisma.db.$transaction(
      async (tx) => {
        const results: UnitImportResult[] = [];
        const existing = new Map(
          (await tx.unit.findMany({ where: { conjunto_id: conjuntoId } })).map((u) => [u.unit_number, u]),
        );
        const types = new Map(
          (await tx.roomType.findMany({ where: { conjunto_id: conjuntoId } })).map((t) => [t.name.toLowerCase(), t]),
        );
        const typeIds = new Set([...types.values()].map((t) => t.id));
        const seen = new Set<string>();
        const toCreate: Prisma.UnitCreateManyInput[] = [];

        for (let i = 0; i < rows.length; i++) {
          const raw = rows[i] ?? ({} as UnitInput);
          const unitNumber = clean(raw.unitNumber) ?? '';
          const res: UnitImportResult = { row: i + 1, unitNumber, status: 'error' };
          results.push(res);
          try {
            if (!unitNumber) throw new Error('falta el número de unidad');
            if (unitNumber.length > 40) throw new Error('número de unidad muy largo');
            if (seen.has(unitNumber)) throw new Error('repetida en el archivo');
            seen.add(unitNumber);

            // Room type: by id (must be ours) or by name (create when missing).
            let roomTypeId: string | null | undefined;
            let typeFee: Decimal | null = null;
            if (raw.roomTypeId !== undefined) {
              roomTypeId = clean(raw.roomTypeId);
              if (roomTypeId && !typeIds.has(roomTypeId)) throw new Error('tipo de habitación inválido');
            } else if (clean(raw.roomType)) {
              const name = clean(raw.roomType)!.slice(0, 80);
              let t = types.get(name.toLowerCase());
              if (!t) {
                t = await tx.roomType.create({ data: { conjunto_id: conjuntoId, name } });
                types.set(name.toLowerCase(), t);
                typeIds.add(t.id);
              }
              roomTypeId = t.id;
            }
            if (roomTypeId) {
              const t = [...types.values()].find((x) => x.id === roomTypeId);
              typeFee = t?.base_fee ? new Decimal(t.base_fee.toString()) : null;
            }

            const fee = parseMoney(raw.monthlyFee);
            const coef = parseDecimal(raw.coeficiente);
            const floor = raw.floor === undefined ? undefined : parseFloor(raw.floor);
            const tower = raw.tower === undefined ? undefined : clean(raw.tower);

            const prev = existing.get(unitNumber);
            if (!prev) {
              toCreate.push({
                conjunto_id: conjuntoId,
                unit_number: unitNumber,
                tower: tower ?? null,
                floor: floor ?? null,
                room_type_id: roomTypeId ?? null,
                monthly_fee: (fee ?? typeFee ?? new Decimal(0)).toFixed(2),
                coeficiente: (coef ?? new Decimal(0)).toFixed(6),
                is_commercial: raw.isCommercial ?? false,
              });
              res.status = 'created';
              continue;
            }
            if (!updateExisting) {
              res.status = 'unchanged';
              res.reason = 'ya existe';
              continue;
            }
            const data: Prisma.UnitUpdateInput = {};
            if (tower !== undefined && tower !== prev.tower) data.tower = tower;
            if (floor !== undefined && floor !== prev.floor) data.floor = floor;
            if (roomTypeId !== undefined && roomTypeId !== prev.room_type_id) {
              data.room_type = roomTypeId ? { connect: { id: roomTypeId } } : { disconnect: true };
            }
            if (fee && !fee.equals(prev.monthly_fee.toString())) data.monthly_fee = fee.toFixed(2);
            if (coef && !coef.equals(prev.coeficiente.toString())) data.coeficiente = coef.toFixed(6);
            if (raw.isCommercial !== undefined && raw.isCommercial !== prev.is_commercial) {
              data.is_commercial = raw.isCommercial;
            }
            if (Object.keys(data).length === 0) {
              res.status = 'unchanged';
              continue;
            }
            await tx.unit.update({ where: { id: prev.id }, data });
            res.status = 'updated';
          } catch (err) {
            res.status = 'error';
            res.reason = (err as Error).message;
          }
        }

        if (toCreate.length) await tx.unit.createMany({ data: toCreate, skipDuplicates: true });
        const total = await tx.unit.count({ where: { conjunto_id: conjuntoId } });
        await tx.conjunto.update({ where: { id: conjuntoId }, data: { total_units: total } });
        return { results, totalUnits: total };
      },
      { timeout: 60_000, maxWait: 10_000 },
    );
  }

  async update(user: AuthUser, unitId: string, dto: Omit<UnitInput, 'unitNumber'> & { unitNumber?: string }) {
    const conjuntoId = this.requireAdmin(user);
    const unit = await this.prisma.db.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.conjunto_id !== conjuntoId) throw new ForbiddenException();
    const { results } = await this.bulk(user, [{ ...dto, unitNumber: unit.unit_number }]);
    if (results[0].status === 'error') throw new BadRequestException(results[0].reason);
    const newNumber = clean(dto.unitNumber);
    if (newNumber && newNumber !== unit.unit_number) {
      try {
        await this.prisma.db.unit.update({ where: { id: unitId }, data: { unit_number: newNumber } });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
          throw new BadRequestException('Ya existe una unidad con ese número');
        }
        throw err;
      }
    }
    return this.prisma.db.unit.findUnique({ where: { id: unitId } });
  }

  async list(user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!user.role || user.role === 'RESIDENT') throw new ForbiddenException();
    const units = await this.prisma.db.unit.findMany({
      where: { conjunto_id: user.conjuntoId },
      select: {
        id: true,
        unit_number: true,
        tower: true,
        floor: true,
        room_type_id: true,
        monthly_fee: true,
        coeficiente: true,
        is_commercial: true,
        _count: { select: { occupancies: { where: { ended_at: null } } } },
      },
    });
    // Natural sort: "2" < "10" < "101", "Torre A-2" < "Torre A-10".
    const collator = new Intl.Collator('es', { numeric: true, sensitivity: 'base' });
    return units
      .sort((a, b) => collator.compare(`${a.tower ?? ''} ${a.unit_number}`, `${b.tower ?? ''} ${b.unit_number}`))
      .map(({ _count, monthly_fee, coeficiente, ...u }) => ({
        ...u,
        monthly_fee: Number(monthly_fee),
        coeficiente: Number(coeficiente),
        occupants: _count.occupancies,
      }));
  }
}
