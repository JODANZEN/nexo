// Import the enum from its origin (@prisma/client) — @nexo/database only re-exports
// it, and the raw-TS package entry isn't node-runnable for this file's self-check.
import { DocumentVisibility } from '@prisma/client';
import type { AuthUser } from '../auth/auth.types';

// Only the fields the RBAC check needs (Prisma model is snake_case).
export type DocAccessFields = {
  conjunto_id: string;
  unit_id: string | null;
  visibility: DocumentVisibility;
};

/**
 * Blueprint 2.2 — tenant isolation first, then visibility level.
 * Pure function: no DB, no I/O. The guard fetches the doc and calls this.
 */
export function canAccessDocument(user: AuthUser, doc: DocAccessFields): boolean {
  // Hard tenant isolation — no exceptions.
  if (user.conjuntoId !== doc.conjunto_id) return false;

  switch (doc.visibility) {
    case DocumentVisibility.ADMIN_ONLY:
      return ['ADMIN', 'REVISOR_FISCAL'].includes(user.role ?? '');
    case DocumentVisibility.UNIT_OWNER:
      return (
        user.role === 'ADMIN' ||
        (user.unitId === doc.unit_id && user.occupancyType === 'OWNER')
      );
    case DocumentVisibility.UNIT_OCCUPANT:
      return user.role === 'ADMIN' || user.unitId === doc.unit_id;
    case DocumentVisibility.ALL_RESIDENTS:
      return ['ADMIN', 'RESIDENT', 'GUARD'].includes(user.role ?? '');
    case DocumentVisibility.PUBLIC:
      return true;
    default:
      return false;
  }
}

// ponytail: self-check, no test framework. Run with `node dist/documents/can-access-document.js`.
if (require.main === module) {
  const assert = require('node:assert') as typeof import('node:assert');
  const base: AuthUser = {
    userId: 'u1',
    conjuntoId: 'cjA',
    unitId: 'ut1',
    role: 'RESIDENT',
    occupancyType: 'TENANT',
  };
  const doc = (over: Partial<DocAccessFields>): DocAccessFields => ({
    conjunto_id: 'cjA',
    unit_id: 'ut1',
    visibility: DocumentVisibility.ALL_RESIDENTS,
    ...over,
  });

  // Cross-tenant is always denied, regardless of visibility.
  assert.equal(canAccessDocument(base, doc({ conjunto_id: 'cjB', visibility: DocumentVisibility.PUBLIC })), false);
  // ADMIN_ONLY blocks a resident, allows admin.
  assert.equal(canAccessDocument(base, doc({ visibility: DocumentVisibility.ADMIN_ONLY })), false);
  assert.equal(canAccessDocument({ ...base, role: 'ADMIN' }, doc({ visibility: DocumentVisibility.ADMIN_ONLY })), true);
  // UNIT_OWNER needs matching unit AND owner occupancy.
  assert.equal(canAccessDocument(base, doc({ visibility: DocumentVisibility.UNIT_OWNER })), false);
  assert.equal(canAccessDocument({ ...base, occupancyType: 'OWNER' }, doc({ visibility: DocumentVisibility.UNIT_OWNER })), true);
  // UNIT_OCCUPANT: any occupancy of the same unit; other units denied.
  assert.equal(canAccessDocument(base, doc({ visibility: DocumentVisibility.UNIT_OCCUPANT })), true);
  assert.equal(canAccessDocument(base, doc({ unit_id: 'ut2', visibility: DocumentVisibility.UNIT_OCCUPANT })), false);
  // ALL_RESIDENTS allows resident; PUBLIC always (same tenant).
  assert.equal(canAccessDocument(base, doc({ visibility: DocumentVisibility.ALL_RESIDENTS })), true);
  assert.equal(canAccessDocument(base, doc({ visibility: DocumentVisibility.PUBLIC })), true);

  console.log('canAccessDocument self-check passed');
}
