import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export interface UpdateConfigDto {
  name?: string;
  address?: string;
  city?: string;
  department?: string;
  moraRate?: number;
  prontoPagoRate?: number;
  parkingRatePerHour?: number;
}

@Injectable()
export class ConfiguracionService {
  constructor(private readonly prisma: PrismaService) {}

  private requireAdmin(user: AuthUser): string {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    return user.conjuntoId;
  }

  async get(user: AuthUser) {
    const conjuntoId = this.requireAdmin(user);
    const c = await this.prisma.db.conjunto.findUnique({ where: { id: conjuntoId } });
    if (!c) throw new NotFoundException('Conjunto not found');
    return {
      id: c.id,
      name: c.name,
      nit: c.nit,
      address: c.address,
      city: c.city,
      department: c.department,
      totalUnits: c.total_units,
      moraRate: Number(c.mora_rate),
      prontoPagoRate: Number(c.pronto_pago_rate),
      parkingRatePerHour: Number(c.parking_rate_per_hour),
    };
  }

  async update(user: AuthUser, dto: UpdateConfigDto) {
    const conjuntoId = this.requireAdmin(user);

    // Guard billing math against absurd/negative rates. mora & pronto pago are
    // monthly fractions (0–1 = 0–100%); parking is COP/hour.
    if (dto.moraRate != null && (dto.moraRate < 0 || dto.moraRate > 1)) {
      throw new BadRequestException('moraRate must be a fraction between 0 and 1');
    }
    if (dto.prontoPagoRate != null && (dto.prontoPagoRate < 0 || dto.prontoPagoRate > 1)) {
      throw new BadRequestException('prontoPagoRate must be a fraction between 0 and 1');
    }
    if (dto.parkingRatePerHour != null && (dto.parkingRatePerHour < 0 || dto.parkingRatePerHour > 1_000_000)) {
      throw new BadRequestException('parkingRatePerHour is out of range');
    }

    await this.prisma.db.conjunto.update({
      where: { id: conjuntoId },
      data: {
        name: dto.name?.trim() || undefined,
        address: dto.address?.trim() ?? undefined,
        city: dto.city?.trim() ?? undefined,
        department: dto.department?.trim() ?? undefined,
        mora_rate: dto.moraRate != null ? dto.moraRate : undefined,
        pronto_pago_rate: dto.prontoPagoRate != null ? dto.prontoPagoRate : undefined,
        parking_rate_per_hour: dto.parkingRatePerHour != null ? dto.parkingRatePerHour : undefined,
      },
    });
    return this.get(user);
  }
}
