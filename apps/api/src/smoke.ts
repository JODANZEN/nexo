// Dev smoke test for Phase 3. Exercises the real BillingService + WompiReconcileProcessor
// against Neon — no HTTP, Clerk, Redis, or Wompi needed. Run: db:seed first, then
//   node --env-file=../../.env dist/smoke.js   (from apps/api)
import type { Job } from 'bullmq';
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { BillingService } from './billing/billing.service';
import { WompiReconcileProcessor, RECONCILE_WOMPI } from './payments/wompi-reconcile.processor';

async function main(): Promise<void> {
  const prismaService = new PrismaService();
  const billing = new BillingService(prismaService);
  const processor = new WompiReconcileProcessor(prismaService);

  const unit = await prisma.unit.findFirst();
  const charge = unit ? await prisma.charge.findFirst({ where: { unit_id: unit.id } }) : null;
  if (!unit || !charge) throw new Error('No seeded unit/charge — run `npm run db:seed` first');

  // ── 3a: balance ──────────────────────────────────────────────
  const balance = await billing.calculateCurrentBalance(unit.id);
  console.log('[3a] GET /billing/units/:unitId/balance');
  console.log('     billingPhase:', balance.billingPhase);
  console.log('     totalDue:', balance.totalDue);
  console.log('     outstandingChargeIds:', balance.outstandingChargeIds.join(', '));

  // Reset to a clean PENDING state so the reconcile is deterministic on re-runs.
  await prisma.payment.deleteMany({ where: { unit_id: unit.id } });
  await prisma.charge.update({ where: { id: charge.id }, data: { paid_amount: '0' } });

  // ── 3b (stub): a PENDING Payment, as generatePaymentLink would create ──
  const reference = `charge_${unit.id}_${Math.floor(Date.now() / 1000)}`;
  const payment = await prisma.payment.create({
    data: {
      conjunto_id: unit.conjunto_id,
      unit_id: unit.id,
      charge_id: charge.id,
      amount: charge.total_amount,
      currency: 'COP',
      method: 'PSE',
      status: 'PENDING',
      gateway_name: 'wompi',
      gateway_reference: reference,
    },
  });
  console.log(`\n[3b-stub] PENDING payment ${payment.id} (ref ${reference})`);

  // ── 3c: simulate an APPROVED Wompi webhook through the real processor ──
  const expectedCents = Math.round(Number(payment.amount) * 100);
  const job = {
    name: RECONCILE_WOMPI,
    data: {
      data: {
        transaction: {
          id: `test-txn-${Date.now()}`,
          reference,
          status: 'APPROVED',
          amount_in_cents: expectedCents,
          currency: 'COP',
        },
      },
    },
  } as unknown as Job;
  await processor.process(job);

  const updatedPayment = await prisma.payment.findUnique({ where: { id: payment.id } });
  const updatedCharge = await prisma.charge.findUnique({ where: { id: charge.id } });
  console.log('\n[3c] after APPROVED webhook:');
  console.log('     Payment.status:', updatedPayment?.status);
  console.log('     Charge.paid_amount:', updatedCharge?.paid_amount.toString());

  const pass =
    updatedPayment?.status === 'PAID' && Number(updatedCharge?.paid_amount) === 350000;
  console.log(`\n3c result: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!pass) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
