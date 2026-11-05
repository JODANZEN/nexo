// Seed one full billing scenario for the Phase 3 end-to-end test.
// Run: npm run db:seed --workspace @nexo/database
import { prisma } from './client';

async function main(): Promise<void> {
  // Clean slate (dev DB) — delete children before parents (FK-safe order).
  // Covers every model added through Phase 9; RESTRICT FKs require leaves first.
  await prisma.payment.deleteMany();
  await prisma.charge.deleteMany();
  await prisma.billingPeriod.deleteMany();
  await prisma.asambleaVote.deleteMany();
  await prisma.asambleaAttendance.deleteMany();
  await prisma.asambleaAgendaItem.deleteMany();
  await prisma.asamblea.deleteMany(); // references document via acta_document_id
  await prisma.pqrComment.deleteMany();
  await prisma.pqr.deleteMany();
  await prisma.inspectionItem.deleteMany();
  await prisma.inspectionRoom.deleteMany();
  await prisma.inspection.deleteMany(); // references unit_occupancies (RESTRICT)
  await prisma.visitorLog.deleteMany();
  await prisma.visitorQrCode.deleteMany();
  await prisma.deliveryLog.deleteMany();
  await prisma.recurringMandate.deleteMany();
  await prisma.parkingSession.deleteMany();
  await prisma.parkingSpot.deleteMany();
  await prisma.reservation.deleteMany();
  await prisma.amenity.deleteMany();
  await prisma.provider.deleteMany();
  await prisma.announcement.deleteMany();
  await prisma.consentRecord.deleteMany();
  await prisma.documentAccessLog.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.unitOccupancy.deleteMany(); // references document via lease_document_id
  await prisma.document.deleteMany();
  await prisma.user.deleteMany();
  await prisma.unit.deleteMany();
  await prisma.conjunto.deleteMany();

  const conjunto = await prisma.conjunto.create({
    data: {
      name: 'Conjunto Residencial El Nogal',
      nit: '900123456-7',
      address: 'Calle 100 # 15-20',
      city: 'Bogotá',
      department: 'Cundinamarca',
      total_units: 1,
      mora_rate: '0.0150',
      pronto_pago_rate: '0.0500',
    },
  });

  const unit = await prisma.unit.create({
    data: {
      conjunto_id: conjunto.id,
      unit_number: '301',
      coeficiente: '0.050000',
      monthly_fee: '350000.00',
    },
  });

  const user = await prisma.user.create({
    data: {
      conjunto_id: conjunto.id,
      external_auth_id: 'user_seed_clerk_sub_001', // pretend Clerk sub for upload FK
      full_name: 'María Restrepo',
      phone: '+573001234567',
      role: 'RESIDENT',
    },
  });

  await prisma.unitOccupancy.create({
    data: {
      unit_id: unit.id,
      user_id: user.id,
      occupancy_type: 'OWNER',
      started_at: new Date(),
    },
  });

  const now = new Date();
  const period = await prisma.billingPeriod.create({
    data: {
      conjunto_id: conjunto.id,
      period_month: now.getMonth() + 1,
      period_year: now.getFullYear(),
      due_date: new Date(now.getFullYear(), now.getMonth(), 10, 23, 59, 59),
      late_fee_rate: '0.0150',
      pronto_pago_rate: '0.0500',
    },
  });

  const charge = await prisma.charge.create({
    data: {
      unit_id: unit.id,
      billing_period_id: period.id,
      base_amount: '350000.00',
      total_amount: '350000.00',
      paid_amount: '0.00',
    },
  });

  console.log('Seeded:');
  console.log(JSON.stringify({
    conjuntoId: conjunto.id,
    unitId: unit.id,
    userId: user.id,
    externalAuthId: user.external_auth_id,
    billingPeriodId: period.id,
    chargeId: charge.id,
  }, null, 2));
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
