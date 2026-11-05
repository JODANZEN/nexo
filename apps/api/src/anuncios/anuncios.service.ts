import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface CreateAnnouncementDto {
  title: string;
  body: string;
  pinned?: boolean;
}

@Injectable()
export class AnunciosService {
  constructor(private readonly prisma: PrismaService) {}

  private requireConjunto(user: AuthUser): string {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  // Any authenticated member of the conjunto can read; pinned first, then newest.
  async list(user: AuthUser, take?: number) {
    const conjuntoId = this.requireConjunto(user);
    return this.prisma.db.announcement.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: [{ pinned: 'desc' }, { created_at: 'desc' }],
      take: take && take > 0 ? take : undefined,
    });
  }

  async create(user: AuthUser, dto: CreateAnnouncementDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    if (!dto.title?.trim() || !dto.body?.trim()) {
      throw new BadRequestException('title and body are required');
    }
    return this.prisma.db.announcement.create({
      data: {
        conjunto_id: conjuntoId,
        title: dto.title.trim(),
        body: dto.body.trim(),
        pinned: dto.pinned ?? false,
        created_by_id: user.userId,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    const a = await this.prisma.db.announcement.findUnique({ where: { id } });
    if (!a || a.conjunto_id !== conjuntoId) throw new NotFoundException('Announcement not found');
    await this.prisma.db.announcement.delete({ where: { id } });
    return { id, deleted: true };
  }
}
