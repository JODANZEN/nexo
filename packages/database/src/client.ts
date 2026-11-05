import { PrismaClient } from '@prisma/client';

/**
 * Singleton PrismaClient shared across all apps in the monorepo.
 *
 * In development, Next.js / NestJS hot-reload can otherwise instantiate a new
 * client on every reload and exhaust the database connection pool. We cache the
 * instance on `globalThis` to guarantee exactly one client per process.
 */
const globalForPrisma = globalThis as unknown as {
  __nexoPrisma?: PrismaClient;
};

export const prisma: PrismaClient =
  globalForPrisma.__nexoPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'production' ? ['error'] : ['error', 'warn'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.__nexoPrisma = prisma;
}
