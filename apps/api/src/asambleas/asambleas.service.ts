import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AsambleaStatus,
  Prisma,
  generatePresignedGetUrl,
  putObject,
  type Asamblea,
} from '@nexo/database';
import Decimal from 'decimal.js';
import { PrismaService } from '../prisma/prisma.service';
import { canTransition, voteHash, VOTE_VALUES } from './asamblea-rules';
import { buildActaPdf, type ActaData } from './acta-pdf';
import type { AuthUser } from '../auth/auth.types';

export interface CreateAsambleaDto {
  title: string;
  type: string;
  scheduledAt: string;
  quorumPercentage: number;
  meetingUrl?: string;
}
export interface AddAgendaDto {
  order: number;
  title: string;
  description?: string;
}
export interface VoteDto {
  voteValue: string;
}

@Injectable()
export class AsambleasService {
  constructor(private readonly prisma: PrismaService) {}

  // Admin creates the assembly and sets the quorum threshold.
  async create(user: AuthUser, dto: CreateAsambleaDto): Promise<Asamblea> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    const scheduledAt = new Date(dto.scheduledAt);
    if (Number.isNaN(scheduledAt.getTime())) {
      throw new BadRequestException('scheduledAt must be a valid date');
    }
    if (dto.quorumPercentage == null || dto.quorumPercentage < 0 || dto.quorumPercentage > 100) {
      throw new BadRequestException('quorumPercentage must be 0–100');
    }
    return this.prisma.db.asamblea.create({
      data: {
        conjunto_id: user.conjuntoId,
        title: dto.title.trim(),
        type: dto.type?.trim() || 'ORDINARIA',
        scheduled_at: scheduledAt,
        quorum_percentage: new Prisma.Decimal(dto.quorumPercentage),
        meeting_url: dto.meetingUrl ?? null,
      },
    });
  }

  // All asambleas in the user's conjunto.
  async list(user: AuthUser): Promise<Asamblea[]> {
    return this.prisma.db.asamblea.findMany({
      where: { conjunto_id: user.conjuntoId ?? undefined },
      orderBy: { scheduled_at: 'desc' },
    });
  }

  // Agenda items + live attendance/quorum progress.
  async getOne(user: AuthUser, id: string) {
    const asamblea = await this.prisma.db.asamblea.findUnique({
      where: { id },
      include: { agenda_items: { orderBy: { order: 'asc' } } },
    });
    if (!asamblea || asamblea.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Asamblea not found');
    }
    const quorum = await this.computeQuorum(asamblea.conjunto_id, id, asamblea.quorum_percentage);
    return {
      ...asamblea,
      quorum: {
        requiredPct: asamblea.quorum_percentage.toFixed(2),
        attendingCoeficiente: quorum.attending.toFixed(6),
        totalCoeficiente: quorum.total.toFixed(6),
        currentPct: quorum.pct.toFixed(2),
        reached: quorum.met,
      },
    };
  }

  // Resident checks in; the coeficiente is snapshotted now.
  async attend(user: AuthUser, id: string) {
    if (!user.unitId) throw new ForbiddenException('No unit on token');
    const asamblea = await this.fetchInConjunto(user, id);
    if (asamblea.status !== AsambleaStatus.QUORUM_OPEN && asamblea.status !== AsambleaStatus.IN_PROGRESS) {
      throw new BadRequestException('Asamblea is not accepting check-ins');
    }
    const unit = await this.prisma.db.unit.findUnique({ where: { id: user.unitId } });
    if (!unit || unit.conjunto_id !== asamblea.conjunto_id) {
      throw new BadRequestException('Unit does not belong to this conjunto');
    }
    const dbUser = await this.resolveUser(user.userId);

    let attendance;
    try {
      attendance = await this.prisma.db.asambleaAttendance.create({
        data: {
          asamblea_id: id,
          user_id: dbUser.id,
          unit_id: unit.id,
          coeficiente: unit.coeficiente, // snapshot — votes use this, not the live value
        },
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Unit already checked in');
      }
      throw err;
    }

    // First time quorum is crossed, stamp quorum_reached_at.
    const quorum = await this.computeQuorum(asamblea.conjunto_id, id, asamblea.quorum_percentage);
    if (quorum.met && !asamblea.quorum_reached_at) {
      await this.prisma.db.asamblea.update({
        where: { id },
        data: { quorum_reached_at: new Date() },
      });
    }

    return {
      attendanceId: attendance.id,
      unitId: unit.id,
      coeficiente: attendance.coeficiente.toFixed(6),
      quorumPct: quorum.pct.toFixed(2),
      quorumReached: quorum.met,
    };
  }

  async addAgenda(user: AuthUser, id: string, dto: AddAgendaDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const asamblea = await this.fetchInConjunto(user, id);
    if (!dto.title?.trim()) throw new BadRequestException('title is required');
    return this.prisma.db.asambleaAgendaItem.create({
      data: {
        asamblea_id: asamblea.id,
        order: dto.order ?? 0,
        title: dto.title.trim(),
        description: dto.description ?? null,
      },
    });
  }

  // Resident casts a weighted vote. Weight = their attendance snapshot.
  async vote(user: AuthUser, id: string, itemId: string, dto: VoteDto) {
    if (!user.unitId) throw new ForbiddenException('No unit on token');
    if (!VOTE_VALUES.includes(dto.voteValue)) {
      throw new BadRequestException(`voteValue must be one of ${VOTE_VALUES.join(', ')}`);
    }
    const asamblea = await this.fetchInConjunto(user, id);
    if (asamblea.status !== AsambleaStatus.IN_PROGRESS) {
      throw new BadRequestException('Voting is only open while the asamblea is IN_PROGRESS');
    }
    const item = await this.prisma.db.asambleaAgendaItem.findUnique({ where: { id: itemId } });
    if (!item || item.asamblea_id !== id) throw new NotFoundException('Agenda item not found');

    // Weight comes from the attendance snapshot, never the live unit value.
    const attendance = await this.prisma.db.asambleaAttendance.findUnique({
      where: { asamblea_id_unit_id: { asamblea_id: id, unit_id: user.unitId } },
    });
    if (!attendance) throw new ForbiddenException('Unit must check in before voting');

    const dbUser = await this.resolveUser(user.userId);
    try {
      const created = await this.prisma.db.asambleaVote.create({
        data: {
          asamblea_id: id,
          agenda_item_id: itemId,
          user_id: dbUser.id,
          unit_id: user.unitId,
          vote_value: dto.voteValue,
          coeficiente: attendance.coeficiente,
          vote_hash: voteHash(itemId, user.unitId, dto.voteValue),
        },
      });
      return { voteId: created.id, voteValue: created.vote_value, coeficiente: created.coeficiente.toFixed(6) };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw new BadRequestException('Unit already voted on this agenda item');
      }
      throw err;
    }
  }

  // Live weighted tally per agenda item.
  async results(user: AuthUser, id: string) {
    const asamblea = await this.prisma.db.asamblea.findUnique({
      where: { id },
      include: { agenda_items: { orderBy: { order: 'asc' } } },
    });
    if (!asamblea || asamblea.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Asamblea not found');
    }
    const tallies = await this.tallyByItem(id);
    return {
      asambleaId: id,
      items: asamblea.agenda_items.map((item) => ({
        agendaItemId: item.id,
        title: item.title,
        ...(tallies.get(item.id) ?? emptyTally()),
      })),
    };
  }

  async updateStatus(user: AuthUser, id: string, status: string): Promise<Asamblea> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!(status in AsambleaStatus)) throw new BadRequestException(`Invalid status: ${status}`);
    const next = status as AsambleaStatus;
    const asamblea = await this.fetchInConjunto(user, id);
    if (!canTransition(asamblea.status, next)) {
      throw new BadRequestException(`Cannot transition ${asamblea.status} → ${next}`);
    }
    return this.prisma.db.asamblea.update({ where: { id }, data: { status: next } });
  }

  // Generate the Acta PDF, store to R2, create an ALL_RESIDENTS Document, link it.
  async generateActa(user: AuthUser, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const asamblea = await this.prisma.db.asamblea.findUnique({
      where: { id },
      include: { agenda_items: { orderBy: { order: 'asc' } }, conjunto: true },
    });
    if (!asamblea || asamblea.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Asamblea not found');
    }
    const dbUser = await this.resolveUser(user.userId);

    const attendances = await this.prisma.db.asambleaAttendance.findMany({
      where: { asamblea_id: id },
      include: { user: true },
    });
    const units = await this.prisma.db.unit.findMany({
      where: { id: { in: attendances.map((a) => a.unit_id) } },
      select: { id: true, unit_number: true },
    });
    const unitNumber = new Map(units.map((u) => [u.id, u.unit_number]));
    const tallies = await this.tallyByItem(id);
    const quorum = await this.computeQuorum(asamblea.conjunto_id, id, asamblea.quorum_percentage);

    const data: ActaData = {
      title: asamblea.title,
      conjuntoName: asamblea.conjunto.name,
      dateLabel: asamblea.scheduled_at.toISOString().slice(0, 10),
      quorumReachedAt: asamblea.quorum_reached_at?.toISOString() ?? null,
      quorumPct: quorum.pct.toFixed(2),
      agenda: asamblea.agenda_items.map((item) => ({
        order: item.order,
        title: item.title,
        tallies: (tallies.get(item.id) ?? emptyTally()).tally.map((t) => ({
          value: t.value,
          coeficiente: t.coeficiente,
          pct: t.pct,
        })),
      })),
      attendees: attendances.map((a) => ({
        unitNumber: unitNumber.get(a.unit_id) ?? a.unit_id,
        name: a.user.full_name,
        coeficiente: a.coeficiente.toFixed(6),
      })),
    };

    const pdf = await buildActaPdf(data);
    const r2Key = `conjuntos/${asamblea.conjunto_id}/asambleas/${id}/acta.pdf`;
    await putObject(r2Key, pdf, 'application/pdf');

    const document = await this.prisma.db.document.create({
      data: {
        conjunto_id: asamblea.conjunto_id,
        uploaded_by_id: dbUser.id,
        title: `Acta — ${asamblea.title}`,
        r2_key: r2Key,
        mime_type: 'application/pdf',
        file_size_bytes: pdf.length,
        visibility: 'ALL_RESIDENTS',
        status: 'ACTIVE',
      },
    });
    await this.prisma.db.asamblea.update({
      where: { id },
      data: { acta_document_id: document.id },
    });

    return {
      actaDocumentId: document.id,
      r2Key,
      url: await generatePresignedGetUrl(r2Key),
    };
  }

  // ── helpers ────────────────────────────────────────────────────

  private async computeQuorum(conjuntoId: string, asambleaId: string, requiredPct: Prisma.Decimal) {
    const [attending, total] = await Promise.all([
      this.prisma.db.asambleaAttendance.aggregate({
        _sum: { coeficiente: true },
        where: { asamblea_id: asambleaId },
      }),
      this.prisma.db.unit.aggregate({
        _sum: { coeficiente: true },
        where: { conjunto_id: conjuntoId },
      }),
    ]);
    const attendingCoef = new Decimal(attending._sum.coeficiente?.toString() ?? '0');
    const totalCoef = new Decimal(total._sum.coeficiente?.toString() ?? '0');
    const pct = totalCoef.isZero() ? new Decimal(0) : attendingCoef.div(totalCoef).mul(100);
    return {
      attending: attendingCoef,
      total: totalCoef,
      pct,
      met: pct.gte(new Decimal(requiredPct.toString())),
    };
  }

  private async tallyByItem(asambleaId: string) {
    const grouped = await this.prisma.db.asambleaVote.groupBy({
      by: ['agenda_item_id', 'vote_value'],
      where: { asamblea_id: asambleaId },
      _sum: { coeficiente: true },
    });
    // agenda_item_id → { value → coeficiente }
    const byItem = new Map<string, Map<string, Decimal>>();
    for (const g of grouped) {
      const m = byItem.get(g.agenda_item_id) ?? new Map<string, Decimal>();
      m.set(g.vote_value, new Decimal(g._sum.coeficiente?.toString() ?? '0'));
      byItem.set(g.agenda_item_id, m);
    }
    const out = new Map<string, ReturnType<typeof emptyTally>>();
    for (const [itemId, m] of byItem) {
      const totalVoted = VOTE_VALUES.reduce((sum, v) => sum.plus(m.get(v) ?? 0), new Decimal(0));
      const tally = VOTE_VALUES.map((value) => {
        const coef = m.get(value) ?? new Decimal(0);
        const pct = totalVoted.isZero() ? new Decimal(0) : coef.div(totalVoted).mul(100);
        return { value, coeficiente: coef.toFixed(6), pct: pct.toFixed(2) };
      });
      out.set(itemId, { totalVotedCoeficiente: totalVoted.toFixed(6), tally });
    }
    return out;
  }

  private async fetchInConjunto(user: AuthUser, id: string): Promise<Asamblea> {
    const asamblea = await this.prisma.db.asamblea.findUnique({ where: { id } });
    if (!asamblea || asamblea.conjunto_id !== user.conjuntoId) {
      throw new NotFoundException('Asamblea not found');
    }
    return asamblea;
  }

  private async resolveUser(authUserId: string) {
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: authUserId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');
    return dbUser;
  }
}

function emptyTally() {
  return {
    totalVotedCoeficiente: '0.000000',
    tally: VOTE_VALUES.map((value) => ({ value, coeficiente: '0.000000', pct: '0.00' })),
  };
}
