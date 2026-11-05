import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

interface TimelineEvent {
  at: Date;
  kind: 'pqr' | 'payment' | 'visitor' | 'delivery';
  title: string;
  detail?: string;
  link?: string;
}

@Injectable()
export class TraceabilityService {
  constructor(private readonly prisma: PrismaService) {}

  // A unit's full activity timeline (tickets, payments, visitors, deliveries).
  // Admin sees any unit in the conjunto; a resident only their own.
  async unitTimeline(user: AuthUser, unitId: string) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const unit = await this.prisma.db.unit.findUnique({
      where: { id: unitId },
      include: {
        room_type: { select: { name: true } },
        occupancies: {
          where: { ended_at: null },
          orderBy: { started_at: 'desc' },
          take: 1,
          include: { user: { select: { full_name: true, phone: true } } },
        },
      },
    });
    if (!unit || unit.conjunto_id !== user.conjuntoId) throw new NotFoundException('Unit not found');
    if (user.role !== 'ADMIN' && user.unitId !== unitId) throw new ForbiddenException();

    const [pqrs, payments, visitors, deliveries] = await Promise.all([
      this.prisma.db.pqr.findMany({
        where: { unit_id: unitId },
        orderBy: { created_at: 'desc' },
        take: 50,
        select: { id: true, title: true, status: true, created_at: true },
      }),
      this.prisma.db.payment.findMany({
        where: { unit_id: unitId },
        orderBy: { created_at: 'desc' },
        take: 50,
        select: { amount: true, status: true, method: true, created_at: true },
      }),
      this.prisma.db.visitorLog.findMany({
        where: { unit_id: unitId },
        orderBy: { checked_in_at: 'desc' },
        take: 50,
        select: { visitor_name: true, status: true, checked_in_at: true },
      }),
      this.prisma.db.deliveryLog.findMany({
        where: { unit_id: unitId },
        orderBy: { received_at: 'desc' },
        take: 50,
        select: { carrier: true, picked_up_at: true, received_at: true },
      }),
    ]);

    const events: TimelineEvent[] = [];
    for (const p of pqrs) {
      events.push({ at: p.created_at, kind: 'pqr', title: `Solicitud: ${p.title}`, detail: p.status, link: `/dashboard/solicitudes/${p.id}` });
    }
    for (const p of payments) {
      events.push({ at: p.created_at, kind: 'payment', title: `Pago ${p.status}`, detail: `${p.method} · $ ${Number(p.amount).toLocaleString('es-CO')}` });
    }
    for (const v of visitors) {
      if (v.checked_in_at) events.push({ at: v.checked_in_at, kind: 'visitor', title: `Visitante: ${v.visitor_name}`, detail: v.status });
    }
    for (const d of deliveries) {
      events.push({ at: d.received_at, kind: 'delivery', title: `Entrega: ${d.carrier}`, detail: d.picked_up_at ? 'Entregada' : 'Pendiente' });
    }

    events.sort((a, b) => b.at.getTime() - a.at.getTime());

    return {
      unit: {
        id: unit.id,
        unitNumber: unit.unit_number,
        roomType: unit.room_type?.name ?? null,
        resident: unit.occupancies[0]?.user.full_name ?? null,
        phone: unit.occupancies[0]?.user.phone ?? null,
      },
      events: events.slice(0, 80),
    };
  }
}
