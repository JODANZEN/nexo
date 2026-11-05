// Security + billing regression smoke (2026-11 review). Drives the real services
// against the DB like the other smokes — no HTTP/Clerk/R2/Redis.
//   npm run db:seed (workspace @nexo/database), then from apps/api:
//   node --env-file=../../.env dist/smoke-security.js
import { createHash } from 'node:crypto';
import { Decimal } from 'decimal.js';
import type { Queue } from 'bullmq';
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { BillingService } from './billing/billing.service';
import { BillingController } from './billing/billing.controller';
import { OnboardingService } from './onboarding/onboarding.service';
import { InspectionsService } from './inspections/inspections.service';
import { PqrsService } from './pqrs/pqrs.service';
import { makePqrsService } from './smoke-helpers';
import { PaymentsService } from './payments/payments.service';
import { WompiReconcileProcessor } from './payments/wompi-reconcile.processor';
import { VisitorPurgeService } from './visitors/visitor-purge.service';
import { assertUnitAccess } from './auth/unit-access';
import { normalizePhone } from './auth/phone';
import type { AuthUser } from './auth/auth.types';
import type { ClerkService } from './clerk/clerk.service';
import type { HubspotService } from './integrations/hubspot.service';

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
  const billing = new BillingService(ps);
  const metadataWrites: string[] = [];
  const clerk = {
    setPublicMetadata: async (id: string) => void metadataWrites.push(id),
    getPrimaryPhone: async () => null,
  } as unknown as ClerkService;
  const hubspot = { upsertContact: async () => undefined } as unknown as HubspotService;
  const onboarding = new OnboardingService(ps, clerk, hubspot);
  const inspections = new InspectionsService(ps);
  const pqrs = makePqrsService(ps);

  // Tenant A = seed conjunto. Tenant B = a second conjunto created here.
  const unitA = await prisma.unit.findFirst();
  const residentRow = await prisma.user.findFirst({ where: { role: 'RESIDENT' } });
  if (!unitA || !residentRow?.external_auth_id) throw new Error('Run db:seed first');
  const cjA = unitA.conjunto_id;

  await prisma.conjunto.deleteMany({ where: { nit: 'SEC-SMOKE-B' } }).catch(() => undefined);
  const cjB = await prisma.conjunto.create({
    data: { name: 'Smoke B', nit: 'SEC-SMOKE-B', address: '', city: '', department: '', total_units: 1 },
  });
  const adminA: AuthUser = { userId: 'admin_a', conjuntoId: cjA, unitId: null, role: 'ADMIN', occupancyType: null };
  const adminB: AuthUser = { userId: 'admin_b', conjuntoId: cjB.id, unitId: null, role: 'ADMIN', occupancyType: null };
  const residentA: AuthUser = {
    userId: residentRow.external_auth_id, conjuntoId: cjA, unitId: unitA.id, role: 'RESIDENT', occupancyType: 'OWNER',
  };

  // 1. Cross-tenant unit access
  check('admin A can access own unit', !(await rejects(() => assertUnitAccess(ps, adminA, unitA.id))));
  check('admin B blocked from tenant A unit', await rejects(() => assertUnitAccess(ps, adminB, unitA.id)));
  const billingCtl = new BillingController(billing, ps);
  check('admin B blocked from tenant A balance', await rejects(() => billingCtl.getBalance(unitA.id, adminB)));

  // 2. assignResident cannot hijack another tenant's account
  const unitB = await prisma.unit.create({
    data: { conjunto_id: cjB.id, unit_number: 'B1', coeficiente: new Decimal('1'), monthly_fee: new Decimal('100000') },
  });
  const adminRowA = await prisma.user.upsert({
    where: { external_auth_id: 'admin_a' },
    update: {},
    create: { conjunto_id: cjA, external_auth_id: 'admin_a', full_name: 'Admin A', phone: '+570', role: 'ADMIN' },
  });
  metadataWrites.length = 0;
  const hijack = await rejects(() =>
    onboarding.assignResident(adminB, unitB.id, { clerkUserId: adminRowA.external_auth_id!, phone: '3001234567' }),
  );
  check('admin B cannot re-assign admin A as a resident', hijack && metadataWrites.length === 0);

  // 3. Inspection photo keys must stay inside the inspection prefix
  const occ = await prisma.unitOccupancy.findFirst({ where: { unit_id: unitA.id } });
  const insp = await inspections.create(residentA, { unitId: unitA.id, occupancyId: occ!.id, type: 'MOVE_IN' } as never);
  check(
    'inspection rejects a foreign R2 key',
    await rejects(() =>
      inspections.addRoom(residentA, insp.id, {
        roomName: 'Sala',
        overallRating: 4,
        photoR2Keys: [`conjuntos/${cjA}/units/common/documents/x/secret.pdf`],
      } as never),
    ),
  );

  // 4. PQR: resident can't file for another unit or attach a foreign key
  check(
    'resident cannot file a PQR for another tenant unit',
    await rejects(() => pqrs.create(residentA, { category: 'MAINTENANCE', title: 't', description: 'd', unitId: unitB.id })),
  );
  check(
    'PQR rejects a foreign attachment key',
    await rejects(() =>
      pqrs.create(residentA, {
        category: 'MAINTENANCE', title: 't', description: 'd', attachments: [`conjuntos/${cjB.id}/units/x/pqr-photos/a.jpg`],
      }),
    ),
  );

  // 5. Wompi event checksum (algorithm from docs.wompi.co → Eventos)
  process.env.WOMPI_EVENTS_KEY = 'test_events_secret';
  const payments = new PaymentsService(ps, billing);
  const evt = {
    event: 'transaction.updated',
    data: { transaction: { id: 'tx-1', status: 'APPROVED', amount_in_cents: 4490000 } },
    timestamp: 1530291411,
    signature: {
      properties: ['transaction.id', 'transaction.status', 'transaction.amount_in_cents'],
      checksum: createHash('sha256').update('tx-1APPROVED44900001530291411test_events_secret').digest('hex').toUpperCase(),
    },
  };
  check('valid Wompi event accepted', payments.verifyWompiEvent(evt));
  const tampered = { ...evt, data: { transaction: { ...evt.data.transaction, amount_in_cents: 1 } } };
  check('tampered Wompi event rejected', !payments.verifyWompiEvent(tampered));

  // 6. Pronto-pago payment settles the charge fully (no false mora next month)
  const charge = await prisma.charge.findFirst({ where: { unit_id: unitA.id } });
  if (charge) {
    await prisma.charge.update({ where: { id: charge.id }, data: { paid_amount: 0 } });
    const discounted = new Decimal(charge.total_amount.toString()).mul(0.95);
    const pay = await prisma.payment.create({
      data: {
        conjunto_id: cjA, unit_id: unitA.id, charge_id: charge.id, amount: discounted.toFixed(2),
        method: 'PSE', status: 'PENDING', gateway_name: 'wompi', gateway_reference: 'link_smoke_sec',
      },
    });
    const proc = new WompiReconcileProcessor(ps);
    await proc.process({
      name: 'reconcile-wompi',
      data: {
        data: {
          transaction: {
            id: 'wompi_tx_smoke_sec', reference: 'wompi-generated', status: 'APPROVED',
            amount_in_cents: Math.round(Number(discounted.toFixed(2)) * 100), currency: 'COP', payment_link_id: 'smoke_sec',
          },
        },
      },
    } as never);
    const after = await prisma.charge.findUnique({ where: { id: charge.id } });
    const payAfter = await prisma.payment.findUnique({ where: { id: pay.id } });
    check(
      'payment-link webhook matched by payment_link_id + discounted payment settles charge',
      payAfter?.status === 'PAID' && after!.paid_amount.equals(after!.total_amount),
    );
    await prisma.payment.delete({ where: { id: pay.id } });
  }

  // 7. Visitor log purge
  const log = await prisma.visitorLog.create({
    data: { conjunto_id: cjA, unit_id: unitA.id, visitor_name: 'Purge Me', status: 'CHECKED_IN', purge_after: new Date(Date.now() - 1000) },
  });
  await new VisitorPurgeService(ps).purgeExpired();
  check('visitor logs past retention are purged', (await prisma.visitorLog.findUnique({ where: { id: log.id } })) === null);

  // 8. Phone normalization matches Clerk's E.164
  check('CO phone normalized to E.164', normalizePhone('300 123 4567') === '+573001234567');

  // 9. Invites: closed sign-up, bulk residents, staff invite claimed by phone
  delete process.env.ALLOW_SELF_SERVE_SIGNUP;
  process.env.PLATFORM_ADMIN_USER_IDS = 'platform_jose';
  const { canCreateConjunto } = await import('./auth/platform');
  check('stranger cannot create a conjunto', !canCreateConjunto({ ...adminB, userId: 'random_user' }));
  check('platform admin can create a conjunto', canCreateConjunto({ ...adminB, userId: 'platform_jose' }));
  check(
    'stranger cannot claim an empty conjunto as admin',
    await rejects(() => onboarding.provision({ ...adminB, userId: 'random_user', conjuntoId: null, role: null }, { conjuntoId: cjB.id })),
  );
  const { InvitesService } = await import('./onboarding/invites.service');
  const invites = new InvitesService(ps);
  const adminBRow = await prisma.user.create({
    data: { conjunto_id: cjB.id, external_auth_id: 'admin_b', full_name: 'Admin B', phone: '+571', role: 'ADMIN' },
  });
  const bulk = await invites.bulk(adminB, [
    { unitNumber: 'B1', phone: '310 555 0101', fullName: 'Res Uno', occupancyType: 'TENANT' },
    { unitNumber: 'B1', phone: '3105550101' },
    { unitNumber: 'NOPE', phone: '3105550102' },
  ]);
  const st = bulk.results.map((r) => r.status).join(',');
  check('bulk invite: invited, duplicate skipped, unknown unit errors', st === 'invited,skipped,error');
  check('resident cannot list invites', await rejects(() => invites.list({ ...residentA })));
  await invites.create(adminB, { phone: '3205550199', role: 'GUARD', fullName: 'Portero B' });
  const clerkPhone = {
    setPublicMetadata: async () => undefined,
    getPrimaryPhone: async () => '+573205550199',
  } as unknown as ClerkService;
  const claimed = await new OnboardingService(ps, clerkPhone, hubspot).provision(
    { userId: 'guard_clerk_b', conjuntoId: null, unitId: null, role: null, occupancyType: null },
    {},
  );
  check('guard invite claimed by verified phone with GUARD role', claimed.role === 'GUARD' && claimed.conjuntoId === cjB.id);

  // Cleanup tenant B
  await prisma.unitOccupancy.deleteMany({ where: { unit: { conjunto_id: cjB.id } } });
  await prisma.user.deleteMany({ where: { conjunto_id: cjB.id } });
  void adminBRow;
  await prisma.unit.delete({ where: { id: unitB.id } });
  await prisma.conjunto.delete({ where: { id: cjB.id } });

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nSecurity smoke: ${failed.length === 0 ? 'PASS ✅' : `FAIL ❌ (${failed.length})`}`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
