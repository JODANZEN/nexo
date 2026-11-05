import { ForbiddenException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from '../auth/auth.types';

@Injectable()
export class ComunidadService {
  constructor(private readonly prisma: PrismaService) {}

  // Directory of people in the conjunto with their active unit (if any).
  async directory(user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const users = await this.prisma.db.user.findMany({
      where: { conjunto_id: user.conjuntoId, is_active: true },
      orderBy: { full_name: 'asc' },
      select: {
        id: true,
        full_name: true,
        phone: true,
        role: true,
        occupancies: {
          where: { ended_at: null },
          orderBy: { started_at: 'desc' },
          take: 1,
          select: { unit: { select: { unit_number: true } } },
        },
      },
    });
    return users.map((u) => ({
      id: u.id,
      name: u.full_name,
      // Phone numbers are personal data: only the administration sees them.
      phone: user.role === 'ADMIN' ? u.phone : null,
      role: u.role,
      unitNumber: u.occupancies[0]?.unit.unit_number ?? null,
    }));
  }
}
