import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface CreateRoomTypeDto {
  name: string;
  description?: string;
  capacity?: number;
  baseFee?: number;
}

@Injectable()
export class RoomTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private requireConjunto(user: AuthUser): string {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async list(user: AuthUser) {
    const conjuntoId = this.requireConjunto(user);
    const types = await this.prisma.db.roomType.findMany({
      where: { conjunto_id: conjuntoId },
      orderBy: { name: 'asc' },
      include: { _count: { select: { units: true } } },
    });
    return types.map((t) => ({
      id: t.id,
      name: t.name,
      description: t.description,
      capacity: t.capacity,
      baseFee: t.base_fee ? Number(t.base_fee) : null,
      unitCount: t._count.units,
    }));
  }

  async create(user: AuthUser, dto: CreateRoomTypeDto) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    if (!dto.name?.trim()) throw new BadRequestException('name is required');
    return this.prisma.db.roomType.create({
      data: {
        conjunto_id: conjuntoId,
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        capacity: dto.capacity != null ? Number(dto.capacity) : null,
        base_fee: dto.baseFee != null ? dto.baseFee : null,
      },
    });
  }

  async remove(user: AuthUser, id: string) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    const type = await this.prisma.db.roomType.findUnique({ where: { id } });
    if (!type || type.conjunto_id !== conjuntoId) throw new NotFoundException('Room type not found');
    // Detach units first, then delete.
    await this.prisma.db.unit.updateMany({ where: { room_type_id: id }, data: { room_type_id: null } });
    await this.prisma.db.roomType.delete({ where: { id } });
    return { id, deleted: true };
  }

  // Assign (or clear) a unit's room type.
  async assignUnit(user: AuthUser, unitId: string, roomTypeId: string | null) {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    const conjuntoId = this.requireConjunto(user);
    const unit = await this.prisma.db.unit.findUnique({ where: { id: unitId } });
    if (!unit || unit.conjunto_id !== conjuntoId) throw new NotFoundException('Unit not found');
    if (roomTypeId) {
      const type = await this.prisma.db.roomType.findUnique({ where: { id: roomTypeId } });
      if (!type || type.conjunto_id !== conjuntoId) throw new NotFoundException('Room type not found');
    }
    return this.prisma.db.unit.update({
      where: { id: unitId },
      data: { room_type_id: roomTypeId },
    });
  }
}
