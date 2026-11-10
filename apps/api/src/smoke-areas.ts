// Area views smoke (2026-11): jefe de área (team lead) visibility + reassignment inside the
// team, plain STAFF and GUARD isolation, admin filters by team / assignee, per-team summary,
// escalation level 2 reaching the team lead. Self-contained: creates and deletes two conjuntos.
//   from apps/api:  node --env-file=../../.env dist/smoke-areas.js   (dev/staging DB only)
import { ForbiddenException } from '@nestjs/common';
import type { Job } from 'bullmq';
import { prisma, PqrCategory, PqrStatus } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { runAsTenant } from './tenancy/tenant-context';
import { OperationsService } from './pqrs/operations.service';
import { EscalationProcessor, EVALUATE } from './pqrs/escalation.processor';
import { NotificationsService } from './notifications/notifications.service';
import { TwilioService } from './integrations/twilio.service';
import { fakeQueue, makePqrsService } from './smoke-helpers';
import type { AuthUser } from './auth/auth.types';

const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => {
  results.push([name, ok]);
  console.log(`${ok ? '✅' : '❌'} ${name}`);
};
/** True only when the call is refused with 403 (not because of some unrelated error). */
async function forbidden(fn: () => Promise<unknown>): Promise<boolean> {
  try {
    await fn();
    return false;
  } catch (err) {
    if (!(err instanceof ForbiddenException)) console.log('   (unexpected error)', String(err));
    return err instanceof ForbiddenException;
  }
}
const NITS = ['AREAS-SMOKE-A', 'AREAS-SMOKE-B'];

async function cleanup(): Promise<void> {
  const cjs = await prisma.conjunto.findMany({ where: { nit: { in: NITS } }, select: { id: true } });
  const ids = cjs.map((c) => c.id);
  if (!ids.length) return;
  const where = { conjunto_id: { in: ids } };
  await prisma.notification.deleteMany({ where });
  await prisma.auditLog.deleteMany({ where });
  await prisma.pqrComment.deleteMany({ where: { pqr: where } });
  await prisma.pqr.deleteMany({ where });
  await prisma.unitOccupancy.deleteMany({ where: { unit: where } });
  await prisma.user.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.conjunto.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  await cleanup();
  const ps = new PrismaService();
  const ops = new OperationsService(ps);
  const pqrs = makePqrsService(ps);
  const notifier = new NotificationsService(ps, new TwilioService());
  const escalation = new EscalationProcessor(ps, notifier, fakeQueue, ops);

  const mk = (nit: string) =>
    prisma.conjunto.create({ data: { name: `Areas ${nit}`, nit, address: '', city: 'Cali', department: '', total_units: 0 } });
  const cjA = await mk(NITS[0]);
  const cjB = await mk(NITS[1]);
  const A = <T>(fn: () => Promise<T>) => runAsTenant(cjA.id, fn);
  let n = 0;
  const person = async (conjuntoId: string, key: string, role: 'ADMIN' | 'STAFF' | 'GUARD' | 'RESIDENT', team?: string) => {
    const row = await prisma.user.create({
      data: { conjunto_id: conjuntoId, external_auth_id: `areas_${key}`, full_name: key, phone: `+57311555${String(++n).padStart(4, '0')}`, role, team },
    });
    const auth: AuthUser = { userId: `areas_${key}`, conjuntoId, unitId: null, role, occupancyType: null };
    return { row, auth };
  };
  const admin = await person(cjA.id, 'admin_a', 'ADMIN');
  const adminB = await person(cjB.id, 'admin_b', 'ADMIN');
  const lead = await person(cjA.id, 'jefe_mtto', 'STAFF', 'Mantenimiento');
  const tech = await person(cjA.id, 'tecnico', 'STAFF', 'mantenimiento'); // free text: case differs
  const cleaner = await person(cjA.id, 'aseo_1', 'STAFF', 'Aseo');
  const cleanLead = await person(cjA.id, 'jefe_aseo', 'STAFF', 'Aseo');
  const exTech = await person(cjA.id, 'tecnico_inactivo', 'STAFF', 'Mantenimiento');
  await prisma.user.update({ where: { id: exTech.row.id }, data: { is_active: false } });
  const guard = await person(cjA.id, 'portero', 'GUARD');
  const res = await person(cjA.id, 'residente', 'RESIDENT');
  const unit = await prisma.unit.create({
    data: { conjunto_id: cjA.id, unit_number: '101', coeficiente: 1, monthly_fee: 0 },
  });
  await prisma.unitOccupancy.create({ data: { unit_id: unit.id, user_id: res.row.id, occupancy_type: 'TENANT', started_at: new Date() } });
  res.auth.unitId = unit.id;

  // Plain 24/7 clock so the escalation maths below is deterministic.
  await A(() => ops.updateConfig(admin.auth, { sla: { P3: { firstResponse: 1, resolution: 10, businessHours: false } } }));
  const ticket = (title: string, assignedToId: string | null) =>
    A(() =>
      pqrs.createInternal({
        conjuntoId: cjA.id, submittedById: res.row.id, unitId: unit.id, category: PqrCategory.MAINTENANCE,
        title, description: 'x', assignedToId,
      }),
    );
  const tLead = await ticket('Del jefe', lead.row.id);
  const tTech = await ticket('Del técnico', tech.row.id);
  const tAseo = await ticket('De aseo', cleaner.row.id);
  const tNone = await ticket('Sin asignar', null);
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id).sort().join(',');
  const same = (rows: { id: string }[], ...expected: { id: string }[]) => ids(rows) === ids(expected);

  // ── 1. Who can name a jefe de área ───────────────────────────────────────
  check(
    'admin of another conjunto cannot set is_team_lead here',
    (await runAsTenant(cjB.id, () => forbidden(() => ops.setTeamLead(adminB.auth, lead.row.id, true)))) &&
      (await prisma.user.findUnique({ where: { id: lead.row.id } }))?.is_team_lead === false,
  );
  check('staff cannot make themselves jefe de área', await A(() => forbidden(() => ops.setTeamLead(lead.auth, lead.row.id, true))));
  check('a resident cannot be made jefe de área', await A(() => forbidden(() => ops.setTeamLead(admin.auth, res.row.id, true))));
  check('before the flag: scope=team is refused', await A(() => forbidden(() => pqrs.list(lead.auth, { scope: 'team' }))));
  await A(() => ops.setTeamLead(admin.auth, lead.row.id, true));
  await A(() => ops.setTeamLead(admin.auth, cleanLead.row.id, true));
  const roster = await A(() => ops.team(lead.auth));
  check(
    'admin sets the flag; team roster exposes isTeamLead + isMe',
    roster.find((m) => m.id === lead.row.id)?.isTeamLead === true &&
      roster.find((m) => m.id === lead.row.id)?.isMe === true &&
      roster.find((m) => m.id === tech.row.id)?.isTeamLead === false,
  );

  // ── 2. What each role sees ───────────────────────────────────────────────
  const teamList = await A(() => pqrs.list(lead.auth, { scope: 'team', status: 'ACTIVE' }));
  check('jefe sees his team’s tickets (label matched ignoring case)', same(teamList, tLead, tTech));
  check('…with who holds each one', (teamList as Array<{ id: string; assigned_to?: { full_name: string } }>).find((t) => t.id === tTech.id)?.assigned_to?.full_name === 'tecnico');
  check('jefe’s own list is still only his', same(await A(() => pqrs.list(lead.auth)), tLead));
  check('jefe opens a teammate’s ticket', (await A(() => pqrs.getOne(lead.auth, tTech.id))).id === tTech.id);
  check('jefe cannot open another team’s ticket', await A(() => forbidden(() => pqrs.getOne(lead.auth, tAseo.id))));
  check('jefe cannot open an unassigned ticket', await A(() => forbidden(() => pqrs.getOne(lead.auth, tNone.id))));
  check('plain staff list = only theirs', same(await A(() => pqrs.list(tech.auth)), tTech));
  check('plain staff cannot use scope=team', await A(() => forbidden(() => pqrs.list(tech.auth, { scope: 'team' }))));
  check('plain staff cannot open a teammate’s ticket', await A(() => forbidden(() => pqrs.getOne(tech.auth, tLead.id))));
  check('GUARD lists no tickets', (await A(() => pqrs.list(guard.auth))).length === 0);
  check('GUARD cannot open a ticket', await A(() => forbidden(() => pqrs.getOne(guard.auth, tTech.id))));
  check(
    'GUARD / staff / resident cannot use the admin filters',
    (await A(() => forbidden(() => pqrs.list(guard.auth, { team: 'Mantenimiento' })))) &&
      (await A(() => forbidden(() => pqrs.list(tech.auth, { assignee: lead.row.id })))) &&
      (await A(() => forbidden(() => pqrs.list(res.auth, { team: 'Aseo' })))),
  );
  const asResident = (await A(() => pqrs.getOne(res.auth, tTech.id))) as { assigned_to?: unknown };
  check('resident does not get the assignee’s name', asResident.assigned_to === undefined);

  // ── 3. What a jefe can do ────────────────────────────────────────────────
  await A(() => pqrs.addComment(lead.auth, tTech.id, { body: 'Reviso con el técnico', isInternal: true }));
  const moved = await A(() => pqrs.updateStatus(lead.auth, tTech.id, 'IN_REVIEW'));
  check('jefe comments and moves a teammate’s ticket', moved.status === PqrStatus.IN_REVIEW);
  check('jefe cannot close', await A(() => forbidden(() => pqrs.updateStatus(lead.auth, tTech.id, 'CLOSED'))));
  check('jefe cannot reassign outside his team', await A(() => forbidden(() => pqrs.assign(lead.auth, tTech.id, cleaner.row.id))));
  check('jefe cannot reassign to a resident', await A(() => forbidden(() => pqrs.assign(lead.auth, tTech.id, res.row.id))));
  check('jefe cannot reassign to an admin', await A(() => forbidden(() => pqrs.assign(lead.auth, tTech.id, admin.row.id))));
  check('jefe cannot reassign to an inactive teammate', await A(() => forbidden(() => pqrs.assign(lead.auth, tTech.id, exTech.row.id))));
  check('jefe cannot pull another team’s ticket into his', await A(() => forbidden(() => pqrs.assign(lead.auth, tAseo.id, tech.row.id))));
  check('jefe cannot take an unassigned ticket', await A(() => forbidden(() => pqrs.assign(lead.auth, tNone.id, tech.row.id))));
  check('plain staff cannot reassign', await A(() => forbidden(() => pqrs.assign(tech.auth, tTech.id, lead.row.id))));
  const re = await A(() => pqrs.assign(lead.auth, tLead.id, tech.row.id));
  check('jefe reassigns inside his team', re.assigned_to_id === tech.row.id);
  check('…and the ticket stays visible to him through the team', same(await A(() => pqrs.list(lead.auth, { scope: 'team' })), tLead, tTech));

  // ── 4. Admin: filters + summary by area ──────────────────────────────────
  check('admin ?team= returns that team only', same(await A(() => pqrs.list(admin.auth, { team: 'MANTENIMIENTO' })), tLead, tTech));
  check('admin ?assignee= returns that person only', same(await A(() => pqrs.list(admin.auth, { assignee: cleaner.row.id })), tAseo));
  check('admin ?assignee=none returns the unassigned', same(await A(() => pqrs.list(admin.auth, { assignee: 'none' })), tNone));
  check('admin without filters still sees everything', (await A(() => pqrs.list(admin.auth))).length === 4);
  check(
    'another conjunto’s admin gets nothing with the same filters',
    (await runAsTenant(cjB.id, () => pqrs.list(adminB.auth, { team: 'Mantenimiento' }))).length === 0 &&
      (await runAsTenant(cjB.id, () => pqrs.list(adminB.auth, { assignee: tech.row.id }))).length === 0,
  );
  await A(() => pqrs.updateStatus(admin.auth, tLead.id, 'IN_REVIEW'));
  await A(() => pqrs.updateStatus(admin.auth, tLead.id, 'AWAITING_RESIDENT'));
  await prisma.pqr.update({ where: { id: tAseo.id }, data: { resolution_due_at: new Date(Date.now() - 60_000) } });
  const summary = await A(() => ops.teamSummary(admin.auth));
  const of = (kind: string, team?: string) => summary.find((r) => r.kind === kind && (!team || r.team === team));
  const mt = of('team', 'Mantenimiento');
  const as = of('team', 'Aseo');
  check('summary: Mantenimiento = 1 activa, 1 esperando residente, 0 vencidas, 2 miembros activos',
    mt?.active === 1 && mt.awaiting === 1 && mt.overdue === 0 && mt.members === 2);
  check('summary: Aseo = 1 activa, 1 vencida', as?.active === 1 && as.overdue === 1 && as.awaiting === 0);
  check('summary: unassigned tickets get their own row', of('unassigned')?.active === 1);
  check('summary is admin-only', await A(() => forbidden(() => ops.teamSummary(lead.auth))));

  // ── 5. Escalation level 2 reaches the jefe of the assignee's team ────────
  const tEsc = await ticket('Por vencer', tech.row.id);
  await new Promise((r) => setTimeout(r, 300)); // let fire-and-forget assignment notices land
  await prisma.pqr.update({
    where: { id: tEsc.id },
    data: { first_responded_at: new Date(), resolution_due_at: new Date(Date.now() + 30 * 60_000) }, // 95% of a 10 h window
  });
  await escalation.process({ name: EVALUATE, data: { pqrId: tEsc.id } } as Job<{ pqrId: string }>);
  const esc = await prisma.notification.findMany({ where: { entity_id: tEsc.id, type: 'pqr.escalation' } });
  check('escalation reached level 2', (await prisma.pqr.findUnique({ where: { id: tEsc.id } }))?.escalation_level === 2);
  check('level 2 notifies the admins (dashboard link)', esc.some((x) => x.user_id === admin.row.id && x.link === `/dashboard/solicitudes/${tEsc.id}`));
  check('level 2 notifies the jefe of that team (link to /tareas/<id>)', esc.some((x) => x.user_id === lead.row.id && x.link === `/tareas/${tEsc.id}`));
  check('…and nobody else (other team’s jefe, the assignee)', esc.length === 2);

  // ── 6. The flag alone is not enough: no team → no team powers ────────────
  await A(() => ops.setTeam(admin.auth, lead.row.id, null));
  check('jefe without a team loses the team view', await A(() => forbidden(() => pqrs.list(lead.auth, { scope: 'team' }))));
  check('…and access to teammates’ tickets', await A(() => forbidden(() => pqrs.getOne(lead.auth, tTech.id))));
  await A(() => ops.setTeam(admin.auth, lead.row.id, 'Mantenimiento'));
  await A(() => ops.setTeamLead(admin.auth, lead.row.id, false));
  check('removing the flag removes the powers', await A(() => forbidden(() => pqrs.getOne(lead.auth, tTech.id))));

  await new Promise((r) => setTimeout(r, 300));
  await cleanup();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nAreas smoke: ${failed.length === 0 ? 'PASS ✅' : `FAIL ❌ (${failed.length})`}`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
