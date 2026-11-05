// Dev smoke test for Phase 5 (Portería). Drives VisitorsService + DeliveriesService
// against Neon — no HTTP/Clerk/Redis. Run db:seed first, then:
//   node --env-file=../../.env dist/smoke-phase5.js   (from apps/api)
import type { Queue } from 'bullmq';
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { VisitorsService } from './visitors/visitors.service';
import { DeliveriesService } from './deliveries/deliveries.service';
import type { AuthUser } from './auth/auth.types';

const fakeQueue = { add: async () => undefined } as unknown as Queue;

async function main(): Promise<void> {
  const prismaService = new PrismaService();
  const visitors = new VisitorsService(prismaService, fakeQueue);
  const deliveries = new DeliveriesService(prismaService);

  const unit = await prisma.unit.findFirst();
  const seededUser = await prisma.user.findFirst();
  if (!unit || !seededUser?.external_auth_id) {
    throw new Error('Missing seed data — run `npm run db:seed` first');
  }

  const resident: AuthUser = {
    userId: seededUser.external_auth_id,
    conjuntoId: unit.conjunto_id,
    unitId: unit.id,
    role: 'RESIDENT',
    occupancyType: 'OWNER',
  };
  const guard: AuthUser = {
    userId: 'guard_smoke',
    conjuntoId: unit.conjunto_id,
    unitId: null,
    role: 'GUARD',
    occupancyType: null,
  };

  // Clean prior smoke rows (FK-safe).
  await prisma.visitorLog.deleteMany();
  await prisma.visitorQrCode.deleteMany();
  await prisma.deliveryLog.deleteMany();

  // ── QR generate → scan → VisitorLog ─────────────────────────────
  const qr = await visitors.generateQr(resident, {
    visitorName: 'Pedro Gómez',
    validFrom: new Date(Date.now() - 60_000).toISOString(),
    validUntil: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    unitId: unit.id,
  });
  console.log('[QR] generated token:', qr.qrToken.slice(0, 8) + '…', '| visitor:', qr.visitorName);

  const scan = await visitors.scan(guard, { qrToken: qr.qrToken });
  const log = await prisma.visitorLog.findFirst({ where: { qr_code_id: qr.qrCodeId } });
  const qrAfter = await prisma.visitorQrCode.findUnique({ where: { id: qr.qrCodeId } });
  console.log(
    '[Scan] resident:',
    scan.residentName,
    '| unit:',
    scan.unitNumber,
    '| VisitorLog:',
    log?.status,
    '| QR:',
    qrAfter?.status,
  );
  const visitorPass =
    log?.status === 'CHECKED_IN' && qrAfter?.status === 'CHECKED_IN' && scan.visitorName === 'Pedro Gómez';

  // ── Delivery log → pickup ───────────────────────────────────────
  const delivery = await deliveries.create(guard, {
    carrier: 'servientrega',
    unitId: unit.id,
    trackingNumber: 'SV-99887766',
    description: 'Caja mediana',
  });
  const pending = await deliveries.listPending(resident, unit.id);
  const pickedUp = await deliveries.confirmPickup(resident, delivery.id);
  console.log(
    '[Delivery] created:',
    delivery.id.slice(0, 8) + '…',
    '| pending count:',
    pending.length,
    '| picked_up_at:',
    pickedUp.picked_up_at?.toISOString(),
  );
  const deliveryPass =
    pending.length === 1 && pickedUp.picked_up_at != null && pickedUp.picked_up_by_id != null;

  const pass = visitorPass && deliveryPass;
  console.log(`\nPhase 5 smoke: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!pass) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
