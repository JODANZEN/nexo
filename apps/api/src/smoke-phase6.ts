// Dev smoke test for Phase 6 (Asamblea Voting). Drives AsambleasService against Neon.
// The R2 acta upload is mocked (we render the PDF buffer but skip putObject/Document).
// Run db:seed first, then: node --env-file=../../.env dist/smoke-phase6.js  (from apps/api)
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { AsambleasService } from './asambleas/asambleas.service';
import { buildActaPdf } from './asambleas/acta-pdf';
import type { AuthUser } from './auth/auth.types';

async function main(): Promise<void> {
  const prismaService = new PrismaService();
  const svc = new AsambleasService(prismaService);

  const seededUnit = await prisma.unit.findFirst({ where: { unit_number: '301' } });
  const seededUser = await prisma.user.findFirst();
  if (!seededUnit || !seededUser?.external_auth_id) {
    throw new Error('Missing seed data — run `npm run db:seed` first');
  }
  const conjuntoId = seededUnit.conjunto_id;

  // ── Clean prior Phase 6 rows + extra units (FK-safe) ────────────
  await prisma.asambleaVote.deleteMany();
  await prisma.asambleaAttendance.deleteMany();
  await prisma.asambleaAgendaItem.deleteMany();
  await prisma.asamblea.deleteMany();
  await prisma.unit.deleteMany({ where: { conjunto_id: conjuntoId, unit_number: { in: ['302', '303'] } } });

  // Seeded 301 = 0.05; add 302 = 0.30, 303 = 0.65. Total conjunto coef = 1.00.
  await prisma.unit.update({ where: { id: seededUnit.id }, data: { coeficiente: '0.050000' } });
  const unit302 = await prisma.unit.create({
    data: { conjunto_id: conjuntoId, unit_number: '302', coeficiente: '0.300000', monthly_fee: '500000.00' },
  });
  const unit303 = await prisma.unit.create({
    data: { conjunto_id: conjuntoId, unit_number: '303', coeficiente: '0.650000', monthly_fee: '900000.00' },
  });

  const admin: AuthUser = { userId: 'admin_smoke', conjuntoId, unitId: null, role: 'ADMIN', occupancyType: null };
  // Reuse the seeded User row as the voter for all 3 units (smoke only).
  const resident = (unitId: string): AuthUser => ({
    userId: seededUser.external_auth_id!,
    conjuntoId,
    unitId,
    role: 'RESIDENT',
    occupancyType: 'OWNER',
  });

  // ── Create asamblea (quorum 51%) + agenda ───────────────────────
  const asamblea = await svc.create(admin, {
    title: 'Asamblea Ordinaria 2026',
    type: 'ORDINARIA',
    scheduledAt: new Date().toISOString(),
    quorumPercentage: 51,
  });
  await svc.updateStatus(admin, asamblea.id, 'QUORUM_OPEN');
  const item1 = await svc.addAgenda(admin, asamblea.id, { order: 1, title: 'Aprobar presupuesto 2026' });
  const item2 = await svc.addAgenda(admin, asamblea.id, { order: 2, title: 'Reforma del reglamento' });

  // ── Check in 3 units; quorum crosses 51% on the 3rd ─────────────
  await svc.attend(resident(seededUnit.id), asamblea.id); // 5%
  let a = await prisma.asamblea.findUnique({ where: { id: asamblea.id } });
  const afterUnit1 = a?.quorum_reached_at;
  await svc.attend(resident(unit302.id), asamblea.id); // 35%
  a = await prisma.asamblea.findUnique({ where: { id: asamblea.id } });
  const afterUnit2 = a?.quorum_reached_at;
  await svc.attend(resident(unit303.id), asamblea.id); // 100%
  a = await prisma.asamblea.findUnique({ where: { id: asamblea.id } });
  const afterUnit3 = a?.quorum_reached_at;
  console.log('[Quorum] reached_at after 5%:', afterUnit1, '| 35%:', afterUnit2, '| 100%:', afterUnit3?.toISOString());
  const quorumPass = afterUnit1 == null && afterUnit2 == null && afterUnit3 != null;

  // ── Vote (mix across units) ─────────────────────────────────────
  await svc.updateStatus(admin, asamblea.id, 'IN_PROGRESS');
  await svc.vote(resident(seededUnit.id), asamblea.id, item1.id, { voteValue: 'SI' });
  await svc.vote(resident(unit302.id), asamblea.id, item1.id, { voteValue: 'NO' });
  await svc.vote(resident(unit303.id), asamblea.id, item1.id, { voteValue: 'SI' });
  await svc.vote(resident(seededUnit.id), asamblea.id, item2.id, { voteValue: 'ABSTENCION' });
  await svc.vote(resident(unit302.id), asamblea.id, item2.id, { voteValue: 'SI' });
  await svc.vote(resident(unit303.id), asamblea.id, item2.id, { voteValue: 'NO' });

  // ── Results: weighted tallies sum to 100% ───────────────────────
  const results = await svc.results(admin, asamblea.id);
  let tallyPass = true;
  for (const item of results.items) {
    const sumPct = item.tally.reduce((s, t) => s + Number(t.pct), 0);
    const top = item.tally.map((t) => `${t.value} ${t.pct}%`).join('  ');
    console.log(`[Results] "${item.title}" → ${top}  (Σ ${sumPct.toFixed(2)}%)`);
    if (Math.abs(sumPct - 100) > 0.01) tallyPass = false;
  }

  // vote_hash present on every vote (64-char SHA-256 hex)
  const votes = await prisma.asambleaVote.findMany({ where: { asamblea_id: asamblea.id } });
  const hashPass = votes.length === 6 && votes.every((v) => /^[0-9a-f]{64}$/.test(v.vote_hash));
  console.log('[Hash] votes:', votes.length, '| all vote_hash valid:', hashPass);

  // ── Duplicate vote → 400 ────────────────────────────────────────
  let dupRejected = false;
  try {
    await svc.vote(resident(seededUnit.id), asamblea.id, item1.id, { voteValue: 'NO' });
  } catch (err) {
    dupRejected = true;
    console.log('[Dup] duplicate vote rejected:', (err as Error).message);
  }

  // ── Acta PDF (R2 upload mocked — render buffer only) ────────────
  const pdf = await buildActaPdf({
    title: asamblea.title,
    conjuntoName: 'smoke',
    dateLabel: '2026-06-21',
    quorumReachedAt: afterUnit3?.toISOString() ?? null,
    quorumPct: '100.00',
    agenda: results.items.map((it, i) => ({ order: i + 1, title: it.title, tallies: it.tally })),
    attendees: [],
  });
  console.log('[Acta] PDF rendered (upload mocked):', pdf.length, 'bytes');

  const pass = quorumPass && tallyPass && hashPass && dupRejected && pdf.length > 0;
  console.log(`\nPhase 6 smoke: ${pass ? 'PASS ✅' : 'FAIL ❌'}`);
  if (!pass) process.exitCode = 1;
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
