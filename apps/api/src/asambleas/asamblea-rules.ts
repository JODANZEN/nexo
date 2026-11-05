import { createHash } from 'node:crypto';
import { AsambleaStatus } from '@prisma/client';

export const VOTE_VALUES = ['SI', 'NO', 'ABSTENCION'];

// Integrity hash: SHA-256 of (agendaItemId + unitId + voteValue + VOTE_SECRET).
export function voteHash(agendaItemId: string, unitId: string, voteValue: string): string {
  const secret = process.env.VOTE_SECRET ?? '';
  return createHash('sha256')
    .update(`${agendaItemId}${unitId}${voteValue}${secret}`)
    .digest('hex');
}

// Admin-controlled lifecycle. Forward chain + cancel from any non-terminal state.
const NEXT: Record<AsambleaStatus, AsambleaStatus[]> = {
  [AsambleaStatus.SCHEDULED]: [AsambleaStatus.QUORUM_OPEN, AsambleaStatus.CANCELLED],
  [AsambleaStatus.QUORUM_OPEN]: [AsambleaStatus.IN_PROGRESS, AsambleaStatus.CANCELLED],
  [AsambleaStatus.IN_PROGRESS]: [
    AsambleaStatus.VOTING_CLOSED,
    AsambleaStatus.COMPLETED,
    AsambleaStatus.CANCELLED,
  ],
  [AsambleaStatus.VOTING_CLOSED]: [AsambleaStatus.COMPLETED, AsambleaStatus.CANCELLED],
  [AsambleaStatus.COMPLETED]: [],
  [AsambleaStatus.CANCELLED]: [],
};

export function canTransition(from: AsambleaStatus, to: AsambleaStatus): boolean {
  return NEXT[from].includes(to);
}

// ponytail: self-check, no test framework. Run: node dist/asambleas/asamblea-rules.js
if (require.main === module) {
  const assert = require('node:assert') as typeof import('node:assert');
  process.env.VOTE_SECRET = 'test-secret';

  // Hash is deterministic, sensitive to every input, and depends on the secret.
  const h1 = voteHash('item1', 'unitA', 'SI');
  assert.equal(h1, voteHash('item1', 'unitA', 'SI'));
  assert.notEqual(h1, voteHash('item1', 'unitA', 'NO'));
  assert.notEqual(h1, voteHash('item2', 'unitA', 'SI'));
  process.env.VOTE_SECRET = 'other-secret';
  assert.notEqual(h1, voteHash('item1', 'unitA', 'SI'));
  assert.equal(h1.length, 64); // SHA-256 hex

  // State machine: the legal chain passes, skips/backwards fail.
  assert.equal(canTransition(AsambleaStatus.SCHEDULED, AsambleaStatus.QUORUM_OPEN), true);
  assert.equal(canTransition(AsambleaStatus.QUORUM_OPEN, AsambleaStatus.IN_PROGRESS), true);
  assert.equal(canTransition(AsambleaStatus.IN_PROGRESS, AsambleaStatus.COMPLETED), true);
  assert.equal(canTransition(AsambleaStatus.SCHEDULED, AsambleaStatus.COMPLETED), false);
  assert.equal(canTransition(AsambleaStatus.COMPLETED, AsambleaStatus.IN_PROGRESS), false);

  console.log('asamblea-rules self-check passed');
}
