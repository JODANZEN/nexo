// Dev smoke test for Phase 4 (PQR + Inspection). Drives the real service classes
// against Neon — no HTTP/Clerk/R2/Redis. Run db:seed first, then:
//   node --env-file=../../.env dist/smoke-phase4.js   (from apps/api)
import type { Queue } from 'bullmq';
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { PqrsService } from './pqrs/pqrs.service';
import { makePqrsService } from './smoke-helpers';
import { InspectionsService } from './inspections/inspections.service';
import type { AuthUser } from './auth/auth.types';

// No Redis in the smoke — stub the queue so the fire-and-forget enqueue is a no-op.
const fakeQueue = { add: async () => undefined } as unknown as Queue;

async function main(): Promise<void> {
  const prismaService = new PrismaService();
  const pqrs = makePqrsService(prismaService);
  const inspections = new InspectionsService(prismaService);

  const unit = await prisma.unit.findFirst();
  const seededUser = await prisma.user.findFirst();
  const occupancy = unit ? await prisma.unitOccupancy.findFirst({ where: { unit_id: unit.id } }) : null;
  if (!unit || !seededUser?.external_auth_id || !occupancy) {
    throw new Error('Missing seed data — run `npm run db:seed` first');
  }

  const resident: AuthUser = {
    userId: seededUser.external_auth_id,
    conjuntoId: unit.conjunto_id,
    unitId: unit.id,
    role: 'RESIDENT',
    occupancyType: 'OWNER',
  };
  const admin: AuthUser = {
    userId: 'admin_smoke',
    conjuntoId: unit.conjunto_id,
    unitId: null,
    role: 'ADMIN',
    occupancyType: null,
  };

  // Clean prior smoke rows for deterministic re-runs (FK-safe order).
  await prisma.pqrComment.deleteMany();
  await prisma.pqr.deleteMany();
  await prisma.inspectionItem.deleteMany();
  await prisma.inspectionRoom.deleteMany();
  await prisma.inspection.deleteMany();

  // ── PQR: create → IN_REVIEW → RESOLVED ──────────────────────────
  const pqr = await pqrs.create(resident, {
    category: 'MAINTENANCE',
    title: 'Fuga en el baño',
    description: 'Hay una fuga bajo el lavamanos.',
    unitId: unit.id,
  });
  await pqrs.updateStatus(admin, pqr.id, 'IN_REVIEW');
  const resolved = await pqrs.updateStatus(admin, pqr.id, 'RESOLVED');
  console.log('[PQR] status:', resolved.status, '| resolved_at:', resolved.resolved_at?.toISOString());
  const pqrPass = resolved.status === 'RESOLVED' && resolved.resolved_at != null;

  // ── PQR: invalid transition OPEN → CLOSED must throw ────────────
  const pqr2 = await pqrs.create(resident, {
    category: 'NOISE',
    title: 'Ruido nocturno',
    description: 'Música alta después de las 11pm.',
    unitId: unit.id,
  });
  let rejected = false;
  try {
    await pqrs.updateStatus(admin, pqr2.id, 'CLOSED');
  } catch (err) {
    rejected = true;
    console.log('[PQR] invalid OPEN→CLOSED rejected:', (err as Error).message);
  }

  // ── Inspection: create → add room w/ 3 items → submit ───────────
  const insp = await inspections.create(resident, {
    unitId: unit.id,
    occupancyId: occupancy.id,
    type: 'MOVE_IN',
  });
  await inspections.addRoom(resident, insp.id, {
    roomName: 'Cocina',
    overallRating: 4,
    items: [
      { itemName: 'Paredes', condition: 'BUENO' },
      { itemName: 'Piso', condition: 'REGULAR' },
      { itemName: 'Ventanas', condition: 'BUENO' },
    ],
  });
  const submitted = await inspections.submit(resident, insp.id);
  const itemCount = await prisma.inspectionItem.count({
    where: { room: { inspection_id: insp.id } },
  });
  console.log('[Inspection] status:', submitted.status, '| items:', itemCount);
  const inspPass = submitted.status === 'SUBMITTED' && itemCount === 3;

  const pass = pqrPass && rejected && inspPass;
  console.log(`\nPhase 4 smoke: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!pass) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
