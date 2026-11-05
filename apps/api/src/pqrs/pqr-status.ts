// Import from origin (@prisma/client) so this file's self-check is node-runnable.
import { PqrStatus } from '@prisma/client';

// State machine: OPEN → IN_REVIEW → RESOLVED → CLOSED. Forward-only, no skipping,
// except IN_REVIEW ↔ AWAITING_RESIDENT (Phase 17: pause the SLA clock on the
// resident, then resume or resolve).
const NEXT: Record<PqrStatus, PqrStatus[]> = {
  [PqrStatus.OPEN]: [PqrStatus.IN_REVIEW],
  [PqrStatus.IN_REVIEW]: [PqrStatus.AWAITING_RESIDENT, PqrStatus.RESOLVED],
  [PqrStatus.AWAITING_RESIDENT]: [PqrStatus.IN_REVIEW, PqrStatus.RESOLVED],
  [PqrStatus.RESOLVED]: [PqrStatus.CLOSED],
  [PqrStatus.CLOSED]: [],
};

export function canTransition(from: PqrStatus, to: PqrStatus): boolean {
  return NEXT[from].includes(to);
}

// ponytail: self-check, no test framework. Run: node dist/pqrs/pqr-status.js
if (require.main === module) {
  const assert = require('node:assert') as typeof import('node:assert');
  assert.equal(canTransition(PqrStatus.OPEN, PqrStatus.IN_REVIEW), true);
  assert.equal(canTransition(PqrStatus.IN_REVIEW, PqrStatus.RESOLVED), true);
  assert.equal(canTransition(PqrStatus.RESOLVED, PqrStatus.CLOSED), true);
  assert.equal(canTransition(PqrStatus.OPEN, PqrStatus.RESOLVED), false); // no skipping
  assert.equal(canTransition(PqrStatus.RESOLVED, PqrStatus.IN_REVIEW), false); // no backward
  assert.equal(canTransition(PqrStatus.CLOSED, PqrStatus.OPEN), false); // terminal
  console.log('pqr-status self-check passed');
}
