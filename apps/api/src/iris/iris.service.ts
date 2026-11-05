import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import Groq from 'groq-sdk';
import Decimal from 'decimal.js';
import { nowInColombia } from '@nexo/utils';
import { PrismaService } from '../prisma/prisma.service';

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

const MODEL = 'llama-3.3-70b-versatile';

const UNAVAILABLE_REPLY =
  'Iris no está disponible en este momento. Verifica que GROQ_API_KEY esté configurada en Railway.';

@Injectable()
export class IrisService {
  private readonly logger = new Logger(IrisService.name);

  constructor(private readonly prisma: PrismaService) {}

  private client(): Groq | null {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) return null;
    return new Groq({ apiKey });
  }

  // Read-only snapshot of the conjunto, scoped by tenant. No cédulas (Habeas Data).
  private async gatherContext(conjuntoId: string) {
    const now = nowInColombia();
    const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const conjunto = await this.prisma.db.conjunto.findUnique({
      where: { id: conjuntoId },
      select: { name: true, total_units: true },
    });

    const pqrs = await this.prisma.db.pqr.findMany({
      where: { conjunto_id: conjuntoId, created_at: { gte: since } },
      orderBy: { created_at: 'desc' },
      select: { title: true, status: true, category: true },
    });
    const openPqrs = pqrs.filter((p) => p.status === 'OPEN' || p.status === 'IN_REVIEW');

    const period = await this.prisma.db.billingPeriod.findUnique({
      where: {
        conjunto_id_period_month_period_year: {
          conjunto_id: conjuntoId,
          period_month: now.getMonth() + 1,
          period_year: now.getFullYear(),
        },
      },
      include: { charges: { select: { total_amount: true, paid_amount: true } } },
    });

    let totalCharged = new Decimal(0);
    let totalCollected = new Decimal(0);
    let inMora = 0;
    for (const c of period?.charges ?? []) {
      totalCharged = totalCharged.plus(new Decimal(c.total_amount));
      totalCollected = totalCollected.plus(new Decimal(c.paid_amount));
      if (new Decimal(c.paid_amount).lessThan(new Decimal(c.total_amount))) inMora += 1;
    }
    const pct = totalCharged.greaterThan(0)
      ? totalCollected.div(totalCharged).mul(100).toDecimalPlaces(1).toNumber()
      : 0;

    const visitors = await this.prisma.db.visitorLog.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: { checked_in_at: 'desc' },
      take: 5,
      select: { visitor_name: true },
    });

    return {
      name: conjunto?.name ?? 'el conjunto',
      unitCount: conjunto?.total_units ?? 0,
      openPqrCount: openPqrs.length,
      recentPqrs: pqrs.slice(0, 5).map((p) => p.title),
      totalCharged: totalCharged.toNumber(),
      totalCollected: totalCollected.toNumber(),
      pct,
      inMora,
      recentVisitorNames: visitors.map((v) => v.visitor_name),
    };
  }

  private systemPrompt(ctx: Awaited<ReturnType<IrisService['gatherContext']>>): string {
    const fmt = (n: number) => `$ ${n.toLocaleString('es-CO')}`;
    return [
      `Eres Iris, la asistente virtual de ${ctx.name}.`,
      `Tienes acceso a datos reales del conjunto. Responde siempre en español,`,
      `de forma concisa y profesional. No inventes datos que no estén en el contexto.`,
      ``,
      `CONTEXTO ACTUAL (${new Date().toLocaleDateString('es-CO')}):`,
      `- Unidades: ${ctx.unitCount}`,
      `- PQRs abiertas: ${ctx.openPqrCount} (últimas: ${ctx.recentPqrs.join('; ') || 'ninguna'})`,
      `- Recaudo mes: ${fmt(ctx.totalCollected)} / ${fmt(ctx.totalCharged)} (${ctx.pct}% recaudado)`,
      `- En mora: ${ctx.inMora} unidades`,
      `- Últimas visitas: ${ctx.recentVisitorNames.join(', ') || 'ninguna'}`,
    ].join('\n');
  }

  async chat(conjuntoId: string | null, message: string, history: ChatTurn[] = []): Promise<{ reply: string }> {
    if (!conjuntoId) throw new ForbiddenException('Token has no conjuntoId');

    const groq = this.client();
    if (!groq) return { reply: UNAVAILABLE_REPLY };

    // Never let a Groq/context failure 500 — degrade to a graceful message.
    try {
      const ctx = await this.gatherContext(conjuntoId);
      const completion = await groq.chat.completions.create({
        model: MODEL,
        max_tokens: 512,
        messages: [
          { role: 'system', content: this.systemPrompt(ctx) },
          ...history.map((h) => ({ role: h.role, content: h.content })),
          { role: 'user', content: message },
        ],
      });
      return { reply: completion.choices[0]?.message?.content ?? '' };
    } catch (err) {
      this.logger.error(`Iris chat failed: ${String(err)}`);
      return { reply: UNAVAILABLE_REPLY };
    }
  }

  // 4 suggestion chips, tailored to what's in the DB right now.
  async suggestions(conjuntoId: string | null): Promise<string[]> {
    if (!conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const ctx = await this.gatherContext(conjuntoId);

    const out: string[] = [];
    if (ctx.totalCharged > 0 && ctx.pct < 90) {
      out.push('¿Cuántas unidades están en mora este mes?');
    }
    if (ctx.openPqrCount > 0) {
      out.push('Resume las PQRs abiertas pendientes.');
    }
    out.push('¿Cómo va el recaudo de administración este mes?');
    out.push('Dame un resumen del estado del conjunto hoy.');
    return out.slice(0, 4);
  }
}
