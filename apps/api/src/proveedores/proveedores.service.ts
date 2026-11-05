import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface CreateProviderDto {
  name: string;
  category?: string;
  phone?: string;
  email?: string;
  notes?: string;
}

@Injectable()
export class ProveedoresService {
  constructor(private readonly prisma: PrismaService) {}

  private requireConjunto(user: AuthUser): string {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async list(user: AuthUser) {
    const conjuntoId = this.requireConjunto(user);
    return this.prisma.db.provider.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: { name: 'asc' },
    });
  }

  async create(user: AuthUser, dto: CreateProviderDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.prisma.db.provider.create({
      data: {
        conjunto_id: conjuntoId,
        name: dto.name.trim(),
        category: dto.category?.trim() || null,
        phone: dto.phone?.trim() || null,
        email: dto.email?.trim() || null,
        notes: dto.notes?.trim() || null,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    const provider = await this.prisma.db.provider.findUnique({ where: { id } });
    if (!provider || provider.conjunto_id !== conjuntoId) throw new NotFoundException('Provider not found');
    await this.prisma.db.provider.delete({ where: { id } });
    return { id, deleted: true };
  }
}
