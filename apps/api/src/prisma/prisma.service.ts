import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, prisma, type PrismaClient } from '@nexo/database';
import { currentTenant } from '../tenancy/tenant-context';

/** Role the RLS policies apply to (migration 20261102200000_row_level_security). */
const RLS_ROLE = 'nexo_rls';

function tenantPreamble(client: Pick<PrismaClient, '$executeRaw'>, conjuntoId: string) {
  // set_config(..., true) = SET LOCAL: both last only until the end of the transaction,
  // so nothing leaks to the next request using this pooled connection.
  return client.$executeRaw`SELECT set_config('role', ${RLS_ROLE}, true), set_config('app.conjunto_id', ${conjuntoId}, true)`;
}

/**
 * Every model query made while a tenant is set (i.e. inside an authenticated request
 * of a conjunto) runs as `nexo_rls` with `app.conjunto_id` set, so Postgres RLS
 * enforces tenant isolation even if a service forgets a `conjunto_id` filter.
 * Without a tenant (crons, workers, webhooks, onboarding) queries run unchanged.
 */
const tenantScoped = prisma.$extends({
  query: {
    $allModels: {
      async $allOperations({ args, query }) {
        const conjuntoId = currentTenant();
        if (!conjuntoId) return query(args);
        const [, result] = await prisma.$transaction([tenantPreamble(prisma, conjuntoId), query(args)]);
        return result;
      },
    },
  },
});

type TxFn<T> = (tx: Prisma.TransactionClient) => Promise<T>;
type TxOptions = Parameters<PrismaClient['$transaction']>[1];

/**
 * `db` behaves like PrismaClient. Interactive `$transaction(async tx => …)` runs the
 * tenant preamble once at the start, so every statement inside is RLS-scoped too.
 * Batch `$transaction([...])` is rejected under a tenant (the per-query wrapper would
 * nest transactions) — use the interactive form.
 */
function buildDb(): PrismaClient {
  return new Proxy(tenantScoped as unknown as PrismaClient, {
    get(target, prop, receiver) {
      if (prop === '$transaction') {
        return <T>(arg: TxFn<T> | Prisma.PrismaPromise<unknown>[], options?: TxOptions) => {
          const conjuntoId = currentTenant();
          if (typeof arg === 'function') {
            return prisma.$transaction(async (tx) => {
              if (conjuntoId) await tenantPreamble(tx, conjuntoId);
              return arg(tx);
            }, options as never);
          }
          if (conjuntoId) {
            throw new Error('Use the interactive $transaction(async tx => …) form inside tenant requests (RLS).');
          }
          return (target as PrismaClient).$transaction(arg as never, options as never);
        };
      }
      return Reflect.get(target, prop, receiver);
    },
  });
}

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  /** Tenant-aware client (see above). Same API as PrismaClient. */
  readonly db: PrismaClient = buildDb();

  async onModuleInit(): Promise<void> {
    await prisma.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await prisma.$disconnect();
  }
}
