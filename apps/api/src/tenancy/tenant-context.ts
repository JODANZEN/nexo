import { AsyncLocalStorage } from 'node:async_hooks';
import type { NextFunction, Request, Response } from 'express';

/**
 * Per-request tenant context for Postgres RLS. A middleware opens a store for every
 * request; ClerkAuthGuard fills in the caller's conjuntoId once the JWT is verified.
 * Anything outside a request (crons, BullMQ workers, scripts) has no store and runs
 * as the system (no RLS).
 */
interface TenantStore {
  conjuntoId: string | null;
}

const storage = new AsyncLocalStorage<TenantStore>();

export function tenantContextMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  storage.run({ conjuntoId: null }, next);
}

export function setCurrentTenant(conjuntoId: string | null): void {
  const store = storage.getStore();
  if (store) store.conjuntoId = conjuntoId;
}

export function currentTenant(): string | null {
  return storage.getStore()?.conjuntoId ?? null;
}

/** Run `fn` as a given tenant (tests, scripts). */
export function runAsTenant<T>(conjuntoId: string | null, fn: () => T): T {
  return storage.run({ conjuntoId }, fn);
}
