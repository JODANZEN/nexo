import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { settleChargesForPayment } from './settle-charges';
import { BillingService } from '../billing/billing.service';
import type { AuthUser } from '../auth/auth.types';

// Sandbox: https://sandbox.wompi.co/v1 · Production: https://production.wompi.co/v1
const WOMPI_BASE_URL = process.env.WOMPI_BASE_URL ?? 'https://production.wompi.co/v1';
const WOMPI_PAYMENT_LINKS_URL = `${WOMPI_BASE_URL}/payment_links`;
const WOMPI_PAYMENT_SOURCES_URL = `${WOMPI_BASE_URL}/payment_sources`;
const WOMPI_TRANSACTIONS_URL = `${WOMPI_BASE_URL}/transactions`;

export type WompiMethod = 'PSE' | 'NEQUI' | 'CORRESPONSAL';
export type RecurringMethod = 'CARD' | 'NEQUI' | 'PSE';

export interface GeneratePaymentLinkDto {
  unitId: string;
  chargeIds?: string[];
  paymentMethod: WompiMethod;
}

export interface EnrollRecurringDto {
  unitId: string;
  paymentMethod: RecurringMethod;
  // Wompi tokenizes the card/source client-side (Wompi widget); the resulting
  // single-use token + acceptance token are sent here to create the payment source.
  token?: string;
  acceptanceToken?: string;
  customerEmail?: string;
}

export interface PaymentLinkResult {
  paymentLinkUrl: string;
  reference: string;
  amountInCents: number;
}

// Map our request method to Prisma PaymentMethod + Wompi payment_methods payload.
const METHOD_MAP = {
  PSE: { dbMethod: 'PSE' as const, wompi: [{ type: 'PSE' }] },
  NEQUI: { dbMethod: 'NEQUI' as const, wompi: [{ type: 'NEQUI' }] },
  CORRESPONSAL: {
    dbMethod: 'BANK_TRANSFER' as const,
    wompi: [{ type: 'BANCOLOMBIA_TRANSFER' }, { type: 'EFECTY' }],
  },
};

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
  ) {}

  async generatePaymentLink(dto: GeneratePaymentLinkDto): Promise<PaymentLinkResult> {
    const mapping = METHOD_MAP[dto.paymentMethod];
    if (!mapping) throw new BadRequestException(`Invalid paymentMethod: ${dto.paymentMethod}`);

    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) throw new InternalServerErrorException('WOMPI_PRIVATE_KEY not configured');

    // 1. Compute the exact amount owed right now.
    const balance = await this.billing.calculateCurrentBalance(dto.unitId);
    if (balance.totalDue <= 0) {
      throw new BadRequestException('Unit has no outstanding balance');
    }

    const unit = await this.prisma.db.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit) throw new NotFoundException(`Unit ${dto.unitId} not found`);

    const amountInCents = Math.round(balance.totalDue * 100);
    // reference encodes unitId + timestamp for webhook reconciliation.
    const reference = `charge_${dto.unitId}_${Math.floor(Date.now() / 1000)}`;

    // 2. Build the Wompi payload.
    const payload = {
      name: `Cuota Administración ${balance.periodLabel} - Apto ${balance.unitNumber}`,
      description:
        balance.billingPhase === 'PRONTO_PAGO' ? '✅ Descuento pronto pago aplicado' : '',
      single_use: true,
      collect_shipping: false,
      currency: 'COP',
      amount_in_cents: amountInCents,
      redirect_url: `${process.env.APP_URL ?? ''}/pagos/confirmacion`,
      reference,
      payment_methods: mapping.wompi,
    };

    // 3. POST to Wompi.
    const res = await fetch(WOMPI_PAYMENT_LINKS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${privateKey}`,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new InternalServerErrorException(`Wompi link creation failed (${res.status}): ${detail}`);
    }

    const body = (await res.json()) as { data?: { id?: string } };
    const wompiLinkId = body.data?.id;
    if (!wompiLinkId) throw new InternalServerErrorException('Wompi response missing link id');

    // 4. Store a PENDING Payment keyed by reference (webhook reconciles against it).
    await this.prisma.db.payment.create({
      data: {
        conjunto_id: unit.conjunto_id,
        unit_id: dto.unitId,
        // ponytail: model links one charge per payment — first outstanding charge.
        charge_id: dto.chargeIds?.[0] ?? balance.outstandingChargeIds[0] ?? null,
        amount: balance.totalDue,
        currency: 'COP',
        method: mapping.dbMethod,
        status: 'PENDING',
        gateway_name: 'wompi',
        // Payment-link transactions get a Wompi-generated reference, not ours, but
        // they carry `payment_link_id` — store the link id so the webhook can match.
        gateway_reference: `link_${wompiLinkId}`,
      },
    });

    // 5. Return the hosted checkout URL.
    return {
      paymentLinkUrl: `https://checkout.wompi.co/l/${wompiLinkId}`,
      reference,
      amountInCents,
    };
  }

  // Payment history. Residents are scoped to their unit; admins to the conjunto.
  async listForUser(user: AuthUser) {
    if (user.role === 'ADMIN' && !user.conjuntoId) {
      throw new ForbiddenException('Token has no conjuntoId');
    }
    const where =
      user.role === 'ADMIN'
        ? { conjunto_id: user.conjuntoId as string }
        : { unit_id: user.unitId ?? '__none__' };
    const payments = await this.prisma.db.payment.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 50,
    });
    return payments.map((p) => ({
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
      method: p.method,
      status: p.status,
      createdAt: p.created_at,
      paidAt: p.paid_at,
    }));
  }

  // ── 9.1 Recurring payment mandate ──────────────────────────────────────────

  // Resident saves a payment method once. Creates a Wompi payment source and
  // stores an ACTIVE mandate (one per unit, enforced by @@unique([unit_id, status])).
  async enrollRecurring(dto: EnrollRecurringDto) {
    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) throw new InternalServerErrorException('WOMPI_PRIVATE_KEY not configured');
    if (!['CARD', 'NEQUI', 'PSE'].includes(dto.paymentMethod)) {
      throw new BadRequestException(`Invalid paymentMethod: ${dto.paymentMethod}`);
    }

    const unit = await this.prisma.db.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit) throw new NotFoundException(`Unit ${dto.unitId} not found`);

    // Wompi requires a single-use token (from the client-side widget) to register
    // a reusable payment source. Without it we can't tokenize server-side.
    if (!dto.token || !dto.acceptanceToken) {
      throw new BadRequestException('token and acceptanceToken are required to enroll');
    }

    const res = await fetch(WOMPI_PAYMENT_SOURCES_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${privateKey}` },
      body: JSON.stringify({
        type: dto.paymentMethod,
        token: dto.token,
        customer_email: dto.customerEmail ?? '',
        acceptance_token: dto.acceptanceToken,
      }),
    });
    if (!res.ok) {
      const detail = await res.text();
      throw new InternalServerErrorException(`Wompi payment source failed (${res.status}): ${detail}`);
    }
    const body = (await res.json()) as { data?: { id?: number | string } };
    const sourceId = body.data?.id;
    if (sourceId == null) throw new InternalServerErrorException('Wompi response missing source id');

    // Upsert the ACTIVE mandate for this unit.
    const existing = await this.prisma.db.recurringMandate.findUnique({
      where: { unit_id_status: { unit_id: dto.unitId, status: 'ACTIVE' } },
    });
    const mandate = existing
      ? await this.prisma.db.recurringMandate.update({
          where: { id: existing.id },
          data: { wompi_source_id: String(sourceId), payment_method: dto.paymentMethod },
        })
      : await this.prisma.db.recurringMandate.create({
          data: {
            conjunto_id: unit.conjunto_id,
            unit_id: dto.unitId,
            wompi_source_id: String(sourceId),
            payment_method: dto.paymentMethod,
            status: 'ACTIVE',
          },
        });

    return { id: mandate.id, status: mandate.status, paymentMethod: mandate.payment_method };
  }

  async getRecurringStatus(unitId: string) {
    const mandate = await this.prisma.db.recurringMandate.findUnique({
      where: { unit_id_status: { unit_id: unitId, status: 'ACTIVE' } },
    });
    if (!mandate) return null;
    return {
      id: mandate.id,
      status: mandate.status,
      paymentMethod: mandate.payment_method,
      createdAt: mandate.created_at,
    };
  }

  async cancelRecurring(unitId: string) {
    const mandate = await this.prisma.db.recurringMandate.findUnique({
      where: { unit_id_status: { unit_id: unitId, status: 'ACTIVE' } },
    });
    if (!mandate) throw new NotFoundException('No active mandate for this unit');
    await this.prisma.db.recurringMandate.update({
      where: { id: mandate.id },
      data: { status: 'CANCELLED' },
    });
    return { id: mandate.id, status: 'CANCELLED' };
  }

  /**
   * Auto-charge a single unit against its saved mandate for a billing period.
   * Idempotent: skips if an AUTO_CHARGE payment already exists for a charge in
   * that period. Returns 'charged' | 'skipped' | 'no_balance' | 'failed'.
   */
  async autoChargeUnit(
    mandate: { id: string; unit_id: string; conjunto_id: string; wompi_source_id: string },
    billingMonth: number,
    billingYear: number,
  ): Promise<'charged' | 'skipped' | 'no_balance' | 'failed'> {
    const period = await this.prisma.db.billingPeriod.findUnique({
      where: {
        conjunto_id_period_month_period_year: {
          conjunto_id: mandate.conjunto_id,
          period_month: billingMonth,
          period_year: billingYear,
        },
      },
      include: { charges: { where: { unit_id: mandate.unit_id }, select: { id: true } } },
    });
    const periodChargeIds = period?.charges.map((c) => c.id) ?? [];

    // Idempotency — already auto-charged for this period?
    if (periodChargeIds.length > 0) {
      const already = await this.prisma.db.payment.findFirst({
        where: {
          unit_id: mandate.unit_id,
          method: 'AUTO_CHARGE',
          charge_id: { in: periodChargeIds },
        },
      });
      if (already) return 'skipped';
    }

    const balance = await this.billing.calculateCurrentBalance(mandate.unit_id);
    if (balance.totalDue <= 0) return 'no_balance';

    const privateKey = process.env.WOMPI_PRIVATE_KEY;
    if (!privateKey) throw new InternalServerErrorException('WOMPI_PRIVATE_KEY not configured');

    const amountInCents = Math.round(balance.totalDue * 100);
    const reference = `auto_${mandate.unit_id}_${billingYear}${billingMonth}`;

    const res = await fetch(WOMPI_TRANSACTIONS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${privateKey}` },
      body: JSON.stringify({
        amount_in_cents: amountInCents,
        currency: 'COP',
        customer_email: '',
        reference,
        payment_source_id: Number(mandate.wompi_source_id),
      }),
    });

    const chargeId = balance.outstandingChargeIds[0] ?? null;
    if (!res.ok) {
      await this.prisma.db.payment.create({
        data: {
          conjunto_id: mandate.conjunto_id,
          unit_id: mandate.unit_id,
          charge_id: chargeId,
          amount: balance.totalDue,
          currency: 'COP',
          method: 'AUTO_CHARGE',
          status: 'FAILED',
          gateway_name: 'wompi',
          gateway_reference: reference,
        },
      });
      return 'failed';
    }

    const body = (await res.json()) as { data?: { id?: string; status?: string } };
    const approved = body.data?.status === 'APPROVED' || body.data?.status === 'PENDING';

    const paidNow = body.data?.status === 'APPROVED';
    await this.prisma.db.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          conjunto_id: mandate.conjunto_id,
          unit_id: mandate.unit_id,
          charge_id: chargeId,
          amount: balance.totalDue,
          currency: 'COP',
          method: 'AUTO_CHARGE',
          status: paidNow ? 'PAID' : 'PENDING',
          gateway_name: 'wompi',
          gateway_reference: body.data?.id ?? reference,
          paid_at: paidNow ? new Date() : null,
        },
      });
      // PENDING ones are settled later by the webhook (found by transaction id).
      if (paidNow) await settleChargesForPayment(tx, mandate.unit_id, payment.created_at);
    });

    return approved ? 'charged' : 'failed';
  }

  /**
   * Verify a Wompi event the way Wompi signs it (docs: "Eventos" → "Seguridad"):
   * SHA-256 over the values of `signature.properties` (paths inside `data`, e.g.
   * "transaction.id"), concatenated in order, then `timestamp`, then the events
   * secret. Compared (constant-time, case-insensitive hex) to `signature.checksum`
   * (also sent as the X-Event-Checksum header).
   * ⚠️ Previous version expected an `x-wompi-signature` HMAC header, which Wompi
   * never sends — every real webhook would have been rejected.
   */
  verifyWompiEvent(body: unknown, headerChecksum?: string): boolean {
    const secret = process.env.WOMPI_EVENTS_KEY;
    if (!secret || !body || typeof body !== 'object') return false;
    const evt = body as {
      data?: Record<string, unknown>;
      timestamp?: number | string;
      signature?: { properties?: unknown; checksum?: unknown };
    };
    const props = evt.signature?.properties;
    if (!Array.isArray(props) || props.length === 0 || evt.timestamp == null) return false;

    const values: string[] = [];
    for (const path of props) {
      if (typeof path !== 'string') return false;
      const value = path
        .split('.')
        .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), evt.data);
      if (value === undefined || value === null) return false;
      values.push(String(value));
    }
    const computed = createHash('sha256')
      .update(values.join('') + String(evt.timestamp) + secret)
      .digest('hex')
      .toLowerCase();
    const received = String(evt.signature?.checksum ?? headerChecksum ?? '').toLowerCase();
    const a = Buffer.from(computed);
    const b = Buffer.from(received);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
}
