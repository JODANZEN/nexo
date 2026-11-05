// Postgres RLS smoke. Needs migration 20261102200000_row_level_security applied and
// seed data. Run from apps/api:  node --env-file=../../.env dist/smoke-rls.js
// NOTE: point it at a dev/staging DB — it creates and deletes a throwaway conjunto.
import { Decimal } from 'decimal.js';
import type { Queue } from 'bullmq';
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { PqrsService } from './pqrs/pqrs.service';
import { makePqrsService } from './smoke-helpers';
import { BillingService } from './billing/billing.service';
import { VisitorsService } from './visitors/visitors.service';
import { runAsTenant } from './tenancy/tenant-context';
import type { AuthUser } from './auth/auth.types';

const fakeQueue = { add: async () => undefined } as unknown as Queue;
const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => {
  results.push([name, ok]);
  console.log(`${ok ? '✅' : '❌'} ${name}`);
};
async function rejects(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
}

async function main(): Promise<void> {
  const ps = new PrismaService();
  const db = ps.db;

  const unitA = await prisma.unit.findFirst();
  const resRow = await prisma.user.findFirst({ where: { role: 'RESIDENT' } });
  if (!unitA || !resRow?.external_auth_id) throw new Error('Run db:seed first');
  const cjA = unitA.conjunto_id;

  await prisma.conjunto.deleteMany({ where: { nit: 'RLS-SMOKE-B' } }).catch(() => undefined);
  const cjB = await prisma.conjunto.create({
    data: { name: 'RLS B', nit: 'RLS-SMOKE-B', address: '', city: '', department: '', total_units: 1 },
  });
  const unitB = await prisma.unit.create({
    data: { conjunto_id: cjB.id, unit_number: 'B1', coeficiente: new Decimal('1'), monthly_fee: new Decimal('1') },
  });

  // Isolation as tenant B
  await runAsTenant(cjB.id, async () => {
    const units = await db.unit.findMany();
    check('tenant B sees only its own units', units.length === 1 && units[0].id === unitB.id);
    check('tenant B cannot read a tenant A unit by id', (await db.unit.findUnique({ where: { id: unitA.id } })) === null);
    check('tenant B cannot read tenant A charges (child table)', (await db.charge.count({ where: { unit_id: unitA.id } })) === 0);
    check('tenant B sees only its own conjunto row', (await db.conjunto.findMany()).every((c) => c.id === cjB.id));
    check(
      'tenant B cannot write a row into tenant A',
      await rejects(() =>
        db.announcement.create({ data: { conjunto_id: cjA, title: 'x', body: 'x' } as never }),
      ),
    );
    check(
      'interactive transaction is scoped too',
      (await db.$transaction(async (tx) => tx.unit.count({ where: { conjunto_id: cjA } }))) === 0,
    );
    check(
      'batch $transaction is refused under a tenant',
      await rejects(() => db.$transaction([db.unit.count()])),
    );
  });

  // System context (no tenant) sees everything
  check('system context sees both tenants', (await db.unit.count({ where: { id: { in: [unitA.id, unitB.id] } } })) === 2);

  // Real services keep working under tenant A
  const resident: AuthUser = {
    userId: resRow.external_auth_id, conjuntoId: cjA, unitId: unitA.id, role: 'RESIDENT', occupancyType: 'OWNER',
  };
  const admin: AuthUser = { userId: 'admin_rls', conjuntoId: cjA, unitId: null, role: 'ADMIN', occupancyType: null };
  await runAsTenant(cjA, async () => {
    const pqrs = makePqrsService(ps);
    const pqr = await pqrs.create(resident, { category: 'MAINTENANCE', title: 'RLS', description: 'RLS' });
    await pqrs.updateStatus(admin, pqr.id, 'IN_REVIEW');
    await pqrs.addComment(resident, pqr.id, { body: 'hola' });
    const one = await pqrs.getOne(resident, pqr.id);
    check('PQR create/update/comment work under RLS', one.status === 'IN_REVIEW' && one.comments.length === 1);

    const bal = await new BillingService(ps).calculateCurrentBalance(unitA.id);
    check('billing balance works under RLS', typeof bal.totalDue === 'number');

    const visitors = new VisitorsService(ps, fakeQueue);
    const qr = await visitors.generateQr(resident, {
      visitorName: 'RLS Visit',
      unitId: unitA.id,
      validFrom: new Date(Date.now() - 60_000).toISOString(),
      validUntil: new Date(Date.now() + 3_600_000).toISOString(),
    });
    const guard: AuthUser = { ...admin, role: 'GUARD' };
    const scan = await visitors.scan(guard, { qrToken: qr.qrToken });
    check('visitor QR scan (interactive tx) works under RLS', scan.visitorName === 'RLS Visit');
    await prisma.pqrComment.deleteMany({ where: { pqr_id: pqr.id } });
    await prisma.pqr.delete({ where: { id: pqr.id } });
  });

  await prisma.unit.delete({ where: { id: unitB.id } });
  await prisma.conjunto.delete({ where: { id: cjB.id } });

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nRLS smoke: ${failed.length === 0 ? 'PASS ✅' : `FAIL ❌ (${failed.length})`}`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
