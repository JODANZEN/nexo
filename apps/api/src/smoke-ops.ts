// Operations smoke (2026-11): unit import, STAFF + auto-assignment, per-client SLA with
// business hours, entry authorization (portal + one-time link), preventive maintenance,
// RLS on the new tables. Self-contained: creates and deletes two throwaway conjuntos.
//   from apps/api:  node --env-file=../../.env dist/smoke-ops.js   (dev/staging DB only)
import { prisma, PqrStatus } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { runAsTenant } from './tenancy/tenant-context';
import { UnitsService } from './onboarding/units.service';
import { InvitesService } from './onboarding/invites.service';
import { OperationsService } from './pqrs/operations.service';
import { RoutingService } from './pqrs/routing.service';
import { EntryAuthorizationsService } from './pqrs/entry-authorizations.service';
import { MaintenanceService, advance } from './pqrs/maintenance.service';
import { NotificationsService } from './notifications/notifications.service';
import { TwilioService } from './integrations/twilio.service';
import { addBusinessMs, resolveBusinessHours } from './pqrs/sla';
import { makePqrsService } from './smoke-helpers';
import type { AuthUser } from './auth/auth.types';

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
const NITS = ['OPS-SMOKE-A', 'OPS-SMOKE-B'];

async function cleanup(): Promise<void> {
  const cjs = await prisma.conjunto.findMany({ where: { nit: { in: NITS } }, select: { id: true } });
  const ids = cjs.map((c) => c.id);
  if (!ids.length) return;
  const where = { conjunto_id: { in: ids } };
  await prisma.notification.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.entryAuthorization.deleteMany({ where });
  await prisma.pqrComment.deleteMany({ where: { pqr: where } });
  await prisma.pqr.deleteMany({ where });
  await prisma.maintenancePlan.deleteMany({ where });
  await prisma.pqrRoutingRule.deleteMany({ where });
  await prisma.unitOccupancy.deleteMany({ where: { unit: where } });
  await prisma.user.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.roomType.deleteMany({ where });
  await prisma.conjunto.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  const ps = new PrismaService();
  const units = new UnitsService(ps);
  const invites = new InvitesService(ps);
  const ops = new OperationsService(ps);
  const routing = new RoutingService(ps);
  const pqrs = makePqrsService(ps);
  const notifier = new NotificationsService(ps, new TwilioService());
  const entries = new EntryAuthorizationsService(ps, pqrs, notifier);
  const maintenance = new MaintenanceService(ps, pqrs);

  const mk = (nit: string) =>
    prisma.conjunto.create({ data: { name: `Ops ${nit}`, nit, address: '', city: 'Cali', department: '', total_units: 0 } });
  const cjA = await mk(NITS[0]);
  const cjB = await mk(NITS[1]);
  const admin: AuthUser = { userId: 'ops_admin_a', conjuntoId: cjA.id, unitId: null, role: 'ADMIN', occupancyType: null };
  const adminB: AuthUser = { ...admin, userId: 'ops_admin_b', conjuntoId: cjB.id };
  const adminRow = await prisma.user.create({
    data: { conjunto_id: cjA.id, external_auth_id: admin.userId, full_name: 'Admin Ops', phone: '+573000000001', role: 'ADMIN' },
  });
  await prisma.user.create({
    data: { conjunto_id: cjB.id, external_auth_id: adminB.userId, full_name: 'Admin B', phone: '+573000000002', role: 'ADMIN' },
  });

  // ── 1. Units import ──────────────────────────────────────────────────────
  const imp = await runAsTenant(cjA.id, () =>
    units.bulk(admin, [
      { unitNumber: '101', tower: 'A', floor: '1', roomType: 'Sencilla', monthlyFee: '1.250.000' },
      { unitNumber: '102', tower: 'A', floor: 1, roomType: 'sencilla', monthlyFee: '1250000' },
      { unitNumber: '201', tower: 'A', floor: 2, roomType: 'Doble', coeficiente: '0,5' },
      { unitNumber: '101', roomType: 'Doble' },
      { unitNumber: '', roomType: 'Doble' },
      { unitNumber: '301', monthlyFee: 'abc' },
    ]),
  );
  const st = imp.results.map((r) => r.status).join(',');
  check('unit import: created ×3, dup-in-file + missing number + bad fee → error', st === 'created,created,created,error,error,error');
  const types = await prisma.roomType.findMany({ where: { conjunto_id: cjA.id } });
  check('unit import creates missing room types (case-insensitive)', types.length === 2);
  const u101 = await prisma.unit.findFirst({ where: { conjunto_id: cjA.id, unit_number: '101' } });
  check('Colombian money "1.250.000" parsed exactly', u101?.monthly_fee.toString() === '1250000');
  check('conjunto.total_units synced', (await prisma.conjunto.findUnique({ where: { id: cjA.id } }))?.total_units === 3);
  const again = await runAsTenant(cjA.id, () =>
    units.bulk(admin, [{ unitNumber: '101', monthlyFee: '1300000' }, { unitNumber: '102' }]),
  );
  check('re-import updates changed rows, leaves others', again.results.map((r) => r.status).join(',') === 'updated,unchanged');
  check(
    'creating an existing unit number is refused',
    await runAsTenant(cjA.id, () => rejects(() => units.createOne(admin, { unitNumber: '101' }))),
  );
  const resident0: AuthUser = { userId: 'x', conjuntoId: cjA.id, unitId: u101!.id, role: 'RESIDENT', occupancyType: 'OWNER' };
  check('resident cannot import units', await runAsTenant(cjA.id, () => rejects(() => units.bulk(resident0, [{ unitNumber: '9' }]))));
  check('resident cannot list all units', await runAsTenant(cjA.id, () => rejects(() => units.list(resident0))));

  // ── 2. STAFF + auto-assignment ───────────────────────────────────────────
  await runAsTenant(cjA.id, () => invites.create(admin, { phone: '3105550201', role: 'STAFF', fullName: 'Téc Uno', team: 'Mantenimiento' }));
  const invited = await prisma.user.findFirst({ where: { conjunto_id: cjA.id, role: 'STAFF' } });
  check('STAFF invite stores role + team', invited?.team === 'Mantenimiento' && invited.external_auth_id === null);
  const s1 = await prisma.user.update({ where: { id: invited!.id }, data: { external_auth_id: 'ops_staff_1' } });
  const s2 = await prisma.user.create({
    data: { conjunto_id: cjA.id, external_auth_id: 'ops_staff_2', full_name: 'Téc Dos', phone: '+573105550202', role: 'STAFF' },
  });
  const residentRow = await prisma.user.create({
    data: { conjunto_id: cjA.id, external_auth_id: 'ops_res_1', full_name: 'Residente Ops', phone: '+573105550203', role: 'RESIDENT' },
  });
  await prisma.unitOccupancy.create({ data: { unit_id: u101!.id, user_id: residentRow.id, occupancy_type: 'TENANT', started_at: new Date() } });
  const staff1: AuthUser = { userId: 'ops_staff_1', conjuntoId: cjA.id, unitId: null, role: 'STAFF', occupancyType: null };
  const staff2: AuthUser = { ...staff1, userId: 'ops_staff_2' };
  const resident: AuthUser = { userId: 'ops_res_1', conjuntoId: cjA.id, unitId: u101!.id, role: 'RESIDENT', occupancyType: 'TENANT' };

  check(
    'routing rule rejects a resident as assignee',
    await runAsTenant(cjA.id, () => rejects(() => routing.create(admin, { name: 'x', assigneeIds: [residentRow.id] }))),
  );
  await runAsTenant(cjA.id, () =>
    routing.create(admin, { name: 'Mantenimiento', category: 'MAINTENANCE', assigneeIds: [s1.id, s2.id] }),
  );
  const t1 = await runAsTenant(cjA.id, () => pqrs.create(resident, { category: 'MAINTENANCE', title: 'Fuga', description: 'baño' }));
  const t2 = await runAsTenant(cjA.id, () => pqrs.create(resident, { category: 'MAINTENANCE', title: 'Luz', description: 'cuarto' }));
  const t3 = await runAsTenant(cjA.id, () => pqrs.create(resident, { category: 'NOISE', title: 'Ruido', description: 'vecino' }));
  check('auto-assignment spreads load (least open tickets)', !!t1.assigned_to_id && !!t2.assigned_to_id && t1.assigned_to_id !== t2.assigned_to_id);
  check('no matching rule → unassigned', t3.assigned_to_id === null);
  const s1Ticket = t1.assigned_to_id === s1.id ? t1 : t2;
  const s2Ticket = s1Ticket === t1 ? t2 : t1;
  const mine = await runAsTenant(cjA.id, () => pqrs.list(staff1));
  check('staff list = only their tickets', mine.length === 1 && mine[0].id === s1Ticket.id);
  check('staff cannot open a colleague’s ticket', await runAsTenant(cjA.id, () => rejects(() => pqrs.getOne(staff1, s2Ticket.id))));
  await runAsTenant(cjA.id, () => pqrs.addComment(staff1, s1Ticket.id, { body: 'Voy en camino' }));
  const afterReply = await prisma.pqr.findUnique({ where: { id: s1Ticket.id } });
  check('staff visible reply counts as first response', afterReply?.first_responded_at != null);
  check(
    'manual assign to a resident is refused',
    await runAsTenant(cjA.id, () => rejects(() => pqrs.assign(admin, t3.id, residentRow.id))),
  );
  const team = await runAsTenant(cjA.id, () => ops.team(admin));
  check('team lists staff + admins with load', team.length === 3 && team.find((m) => m.id === s1.id)?.openTickets === 1);

  // ── 3. Per-client SLA + business hours ───────────────────────────────────
  const bhRaw = { days: [1, 2, 3, 4, 5], start: '08:00', end: '17:00', holidays: [] };
  await runAsTenant(cjA.id, () =>
    ops.updateConfig(admin, { sla: { P2: { firstResponse: 2, resolution: 9, businessHours: true } }, businessHours: bhRaw }),
  );
  const t4 = await runAsTenant(cjA.id, () =>
    pqrs.create(resident, { category: 'OTHER', title: 'SLA', description: 'x', priority: 'P2' }),
  );
  const expected = addBusinessMs(t4.created_at, 9 * 3_600_000, resolveBusinessHours(bhRaw));
  check(
    'P2 resolution due = 9 business hours (configured per client)',
    Math.abs(t4.resolution_due_at!.getTime() - expected.getTime()) < 5_000,
  );
  check(
    'staff cannot change targets',
    await runAsTenant(cjA.id, () => rejects(() => ops.updateConfig(staff1, { sla: {} }))),
  );

  // ── 4. Entry authorization ───────────────────────────────────────────────
  const start = new Date(Date.now() - 60_000);
  const end = new Date(Date.now() + 2 * 3_600_000);
  const req = await runAsTenant(cjA.id, () =>
    entries.request(staff1, s1Ticket.id, { windowStart: start.toISOString(), windowEnd: end.toISOString(), reason: 'Revisar fuga' }),
  );
  const paused = await prisma.pqr.findUnique({ where: { id: s1Ticket.id } });
  check('requesting entry pauses the ticket (AWAITING_RESIDENT)', paused?.status === PqrStatus.AWAITING_RESIDENT);
  check('resident cannot request entry', await runAsTenant(cjA.id, () => rejects(() => entries.request(resident, s1Ticket.id, {
    windowStart: start.toISOString(), windowEnd: end.toISOString() }))));
  await new Promise((r) => setTimeout(r, 500)); // notifications are fire-and-forget
  const feed = await prisma.notification.findMany({ where: { user_id: residentRow.id, type: 'entry.requested' } });
  const token = req.approvalUrl.split('/autorizar/')[1];
  check('resident notified; one-time link not stored in the feed', feed.length === 1 && !JSON.stringify(feed).includes(token));
  const stored = await prisma.entryAuthorization.findUnique({ where: { id: req.id } });
  check('only the token hash is stored', !!stored && stored.token_hash !== token && stored.token_hash.length === 64);
  const view = await entries.publicView(token);
  check('public link shows the request (no login)', view.unitNumber === '101' && view.status === 'PENDING');
  check('bad token → not found', await rejects(() => entries.publicView('x'.repeat(32))));
  check(
    'admin of another conjunto cannot decide',
    await runAsTenant(cjB.id, () => rejects(() => entries.decide(adminB, req.id, true))),
  );
  await entries.publicDecide(token, true, 'Estoy en clase, pueden entrar');
  const approved = await prisma.entryAuthorization.findUnique({ where: { id: req.id } });
  const resumed = await prisma.pqr.findUnique({ where: { id: s1Ticket.id }, include: { comments: true } });
  check('link approval → APPROVED, ticket resumes, comment logged',
    approved?.status === 'APPROVED' && resumed?.status === PqrStatus.IN_REVIEW && resumed.comments.some((c) => c.body.includes('aprobó')));
  check('second decision on the same link is refused', await rejects(() => entries.publicDecide(token, false)));
  const guard: AuthUser = { userId: 'ops_guard', conjuntoId: cjA.id, unitId: null, role: 'GUARD', occupancyType: null };
  await prisma.user.create({ data: { conjunto_id: cjA.id, external_auth_id: 'ops_guard', full_name: 'Portero', phone: '+573105550204', role: 'GUARD' } });
  const act = await runAsTenant(cjA.id, () => entries.active(guard));
  check('portería sees the approved entry', act.length === 1 && act[0].unitNumber === '101');
  check('resident cannot see portería list', await runAsTenant(cjA.id, () => rejects(() => entries.active(resident))));
  await runAsTenant(cjA.id, () => entries.markUsed(guard, req.id));
  check('portería marks entry used (audited)',
    (await prisma.entryAuthorization.findUnique({ where: { id: req.id } }))?.status === 'USED' &&
      (await prisma.auditLog.count({ where: { entity_id: req.id, action: 'entry.used' } })) === 1);
  // Portal decision path (deny)
  const req2 = await runAsTenant(cjA.id, () =>
    entries.request(admin, t3.id, { windowStart: start.toISOString(), windowEnd: end.toISOString() }),
  );
  await runAsTenant(cjA.id, () => entries.decide(resident, req2.id, false, 'Prefiero estar presente'));
  check('resident denies from the portal', (await prisma.entryAuthorization.findUnique({ where: { id: req2.id } }))?.status === 'DENIED');

  // ── 5. Preventive maintenance ────────────────────────────────────────────
  const due = new Date(Date.now() - 1000);
  const plan = await runAsTenant(cjA.id, () =>
    maintenance.create(admin, {
      title: 'Limpieza de tanques', intervalUnit: 'MONTH', intervalCount: 6, nextDueAt: due.toISOString(), scope: 'FACILITY',
    }),
  );
  await runAsTenant(cjA.id, () =>
    maintenance.create(admin, {
      title: 'Futuro', intervalUnit: 'WEEK', intervalCount: 1, nextDueAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), leadDays: 3,
    }),
  );
  const n1 = await maintenance.generateDue();
  const n2 = await maintenance.generateDue();
  const gen = await prisma.pqr.findMany({ where: { maintenance_plan_id: plan.id } });
  check('cron creates exactly one ticket per due plan (idempotent, lead time respected)', n1 >= 1 && n2 === 0 && gen.length === 1);
  check('generated ticket is MAINTENANCE and auto-assigned by routing', gen[0]?.category === 'MAINTENANCE' && !!gen[0]?.assigned_to_id);
  const planAfter = await prisma.maintenancePlan.findUnique({ where: { id: plan.id } });
  check('plan advanced by its interval', planAfter!.next_due_at.getTime() === advance(due, 'MONTH', 6).getTime());
  check('month math clamps (Jan 31 + 1 → Feb 28)', advance(new Date('2027-01-31T13:00:00Z'), 'MONTH', 1).toISOString() === '2027-02-28T13:00:00.000Z');

  // ── 6. RLS on the new tables ─────────────────────────────────────────────
  await runAsTenant(cjB.id, async () => {
    const db = ps.db;
    const leaks =
      (await db.pqrRoutingRule.count()) + (await db.maintenancePlan.count()) + (await db.entryAuthorization.count());
    check('tenant B sees none of A’s rules / plans / entry authorizations', leaks === 0);
  });

  await cleanup();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nOps smoke: ${failed.length === 0 ? 'PASS ✅' : `FAIL ❌ (${failed.length})`}`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
