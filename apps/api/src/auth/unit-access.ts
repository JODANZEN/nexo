import { ForbiddenException } from '@nestjs/common';
import type { PrismaService } from '../prisma/prisma.service';
import type { AuthUser } from './auth.types';

/**
 * Tenant + ownership check for any route that takes a unitId.
 * The unit must belong to the caller's conjunto (ADMINs included — an admin of
 * conjunto A must never reach units of conjunto B), and a non-admin may only act
 * on their own unit. Always 403, never 404 (don't leak which ids exist).
 */
export async function assertUnitAccess(
  prisma: PrismaService,
  user: AuthUser,
  unitId: string,
): Promise<void> {
  if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
  if (!unitId) throw new ForbiddenException();
  const unit = await prisma.db.unit.findUnique({
    where: { id: unitId },
    select: { conjunto_id: true },
  });
  if (!unit || unit.conjunto_id !== user.conjuntoId) throw new ForbiddenException();
  if (user.role !== 'ADMIN' && user.unitId !== unitId) throw new ForbiddenException();
}

/**
 * Client-supplied R2 keys (PQR attachments, inspection photos) must point inside
 * the caller's own tenant prefix. Without this, a key from another conjunto (or an
 * admin-only document) could be stored and later turned into a presigned GET.
 */
export function isKeyInPrefix(key: unknown, prefix: string): key is string {
  return (
    typeof key === 'string' &&
    key.startsWith(prefix) &&
    !key.includes('..') &&
    key.length <= 512
  );
}
