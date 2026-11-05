import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import Decimal from 'decimal.js';
import {
  applyDiscount,
  calculateMora,
  daysFromDueDate,
  getBillingDates,
  nowInColombia,
} from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';
import { buildPazSalvoPdf } from './pazsalvo-pdf';

type Phase = 'PRONTO_PAGO' | 'TARIFA_PLENA' | 'MORA';

export interface CuentaPorCobrar {
  unitNumber: string;
  residentName: string | null;
  periodLabel: string;
  baseAmount: number;
  paidAmount: number;
  outstanding: number;
  daysLate: number;
  phase: Phase;
}

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

@Injectable()
export class ContabilidadService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  // Evaluate one charge's phase + outstanding (mirrors the billing engine timeline).
  private evaluateCharge(charge: {
    base_amount: Decimal;
    total_amount: Decimal;
    paid_amount: Decimal;
    billing_period: { period_month: number; period_year: number; late_fee_rate: Decimal; pronto_pago_rate: Decimal | null };
  }) {
    const base = new Decimal(charge.base_amount);
    const paid = new Decimal(charge.paid_amount);
    const remaining = new Decimal(charge.total_amount).minus(paid);

    const { prontoPagoDeadline, tarifaPlenaDeadline } = getBillingDates(
      charge.billing_period.period_month,
      charge.billing_period.period_year,
    );
    const daysLate = daysFromDueDate(tarifaPlenaDeadline);
    const daysFromPronto = daysFromDueDate(prontoPagoDeadline);

    let phase: Phase;
    let outstanding: Decimal;
    if (daysFromPronto < 0) {
      phase = 'PRONTO_PAGO';
      const discount = applyDiscount(remaining, new Decimal(charge.billing_period.pronto_pago_rate ?? 0));
      outstanding = remaining.minus(discount);
    } else if (daysLate <= 0) {
      phase = 'TARIFA_PLENA';
      outstanding = remaining;
    } else {
      phase = 'MORA';
      const mora = calculateMora(base, new Decimal(charge.billing_period.late_fee_rate), daysLate);
      outstanding = remaining.plus(mora);
    }

    return { base, paid, remaining, outstanding, daysLate: Math.max(0, daysLate), phase };
  }

  async cuentasPorCobrar(user: AuthUser): Promise<CuentaPorCobrar[]> {
    const conjuntoId = this.requireAdmin(user);

    const charges = await this.prisma.db.charge.findMany({
      where: { unit: { conjunto_id: conjuntoId } },
      include: {
        billing_period: true,
        unit: {
          select: {
            unit_number: true,
            occupancies: {
              where: { ended_at: null },
              orderBy: { started_at: 'desc' },
              take: 1,
              select: { user: { select: { full_name: true } } },
            },
          },
        },
      },
      orderBy: [{ billing_period: { period_year: 'asc' } }, { billing_period: { period_month: 'asc' } }],
    });

    const rows: CuentaPorCobrar[] = [];
    for (const charge of charges) {
      const ev = this.evaluateCharge(charge);
      if (ev.remaining.lessThanOrEqualTo(0)) continue; // fully paid
      rows.push({
        unitNumber: charge.unit.unit_number,
        residentName: charge.unit.occupancies[0]?.user.full_name ?? null,
        periodLabel: `${MONTHS[charge.billing_period.period_month - 1]} ${charge.billing_period.period_year}`,
        baseAmount: ev.base.toNumber(),
        paidAmount: ev.paid.toNumber(),
        outstanding: ev.outstanding.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
        daysLate: ev.daysLate,
        phase: ev.phase,
      });
    }
    return rows;
  }

  async pazYSalvo(user: AuthUser, unitId: string): Promise<Buffer> {
    const conjuntoId = this.requireAdmin(user);

    const unit = await this.prisma.db.unit.findUnique({
      where: { id: unitId },
      include: {
        conjunto: { select: { name: true } },
        occupancies: {
          where: { ended_at: null },
          orderBy: { started_at: 'desc' },
          take: 1,
          select: { user: { select: { full_name: true } } },
        },
      },
    });
    if (!unit || unit.conjunto_id !== conjuntoId) throw new NotFoundException('Unit not found');

    // Block if the unit has any outstanding balance.
    const charges = await this.prisma.db.charge.findMany({
      where: { unit_id: unitId },
      include: { billing_period: true },
    });
    let totalDue = new Decimal(0);
    for (const charge of charges) {
      const ev = this.evaluateCharge(charge);
      if (ev.remaining.greaterThan(0)) totalDue = totalDue.plus(ev.outstanding);
    }
    if (totalDue.greaterThan(0)) {
      throw new BadRequestException({
        error: 'Unit has outstanding balance',
        totalDue: totalDue.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      });
    }

    const now = nowInColombia();
    return buildPazSalvoPdf({
      conjuntoName: unit.conjunto.name,
      unitNumber: unit.unit_number,
      residentName: unit.occupancies[0]?.user.full_name ?? null,
      dateLabel: now.toLocaleDateString('es-CO', { day: '2-digit', month: 'long', year: 'numeric' }),
    });
  }

  // Manual bank reconciliation: CSV rows [date, description, amount, reference].
  // A row reconciles a Payment when its reference matches Payment.gateway_reference.
  async conciliacion(user: AuthUser, file: Express.Multer.File | undefined) {
    const conjuntoId = this.requireAdmin(user);
    if (!file) throw new BadRequestException('statement file is required');

    const text = file.buffer.toString('utf8');
    const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
    // Skip a header row if the first cell isn't a date-like / the row has a "reference" header.
    if (lines.length > 0 && /reference|referencia/i.test(lines[0])) lines.shift();

    let matched = 0;
    let unmatched = 0;
    const rows: { date: string; description: string; amount: string; reference: string; matched: boolean }[] = [];

    for (const line of lines) {
      const cols = line.split(',').map((c) => c.trim());
      const [date = '', description = '', amount = '', reference = ''] = cols;
      let didMatch = false;

      if (reference) {
        const payment = await this.prisma.db.payment.findFirst({
          where: { conjunto_id: conjuntoId, gateway_reference: reference },
        });
        if (payment) {
          if (!payment.reconciled_at) {
            await this.prisma.db.payment.update({
              where: { id: payment.id },
              data: { reconciled_at: new Date() },
            });
          }
          didMatch = true;
        }
      }

      if (didMatch) matched += 1;
      else unmatched += 1;
      rows.push({ date, description, amount, reference, matched: didMatch });
    }

    return { matched, unmatched, rows };
  }

  async reporteMora(user: AuthUser) {
    const conjuntoId = this.requireAdmin(user);

    const charges = await this.prisma.db.charge.findMany({
      where: { unit: { conjunto_id: conjuntoId } },
      include: {
        billing_period: true,
        unit: { select: { unit_number: true } },
      },
    });

    // Aggregate mora per unit.
    const perUnit = new Map<string, { unitNumber: string; moraOwed: Decimal }>();
    for (const charge of charges) {
      const ev = this.evaluateCharge(charge);
      if (ev.phase !== 'MORA' || ev.remaining.lessThanOrEqualTo(0)) continue;
      const moraOnly = calculateMora(
        new Decimal(charge.base_amount),
        new Decimal(charge.billing_period.late_fee_rate),
        ev.daysLate,
      );
      const entry = perUnit.get(charge.unit_id) ?? {
        unitNumber: charge.unit.unit_number,
        moraOwed: new Decimal(0),
      };
      entry.moraOwed = entry.moraOwed.plus(moraOnly);
      perUnit.set(charge.unit_id, entry);
    }

    const all = [...perUnit.values()].sort((a, b) => b.moraOwed.comparedTo(a.moraOwed));
    const totalMora = all.reduce((sum, u) => sum.plus(u.moraOwed), new Decimal(0));

    return {
      unitsInMora: all.length,
      totalMoraOwed: totalMora.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      top: all.slice(0, 10).map((u) => ({
        unitNumber: u.unitNumber,
        moraOwed: u.moraOwed.toDecimalPlaces(0, Decimal.ROUND_HALF_UP).toNumber(),
      })),
    };
  }
}
