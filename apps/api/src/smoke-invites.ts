// Invitation message smoke (2026-11): creating an invitation queues the SMS/WhatsApp,
// bulk answers without waiting for the sends, resend cooldown (10 min), who may resend.
// Self-contained: two throwaway conjuntos, a fake TwilioService (no network).
//   from apps/api:  node --env-file=../../.env dist/smoke-invites.js   (dev/staging DB only)
import { prisma } from '@nexo/database';
import { PrismaService } from './prisma/prisma.service';
import { runAsTenant } from './tenancy/tenant-context';
import { InvitesService } from './onboarding/invites.service';
import { InviteMessenger } from './onboarding/invite-messenger';
import { TwilioService } from './integrations/twilio.service';
import type { AuthUser } from './auth/auth.types';

const results: Array<[string, boolean]> = [];
const check = (name: string, ok: boolean) => {
  results.push([name, ok]);
  console.log(`${ok ? '✅' : '❌'} ${name}`);
};
async function status(fn: () => Promise<unknown>): Promise<number | null> {
  try {
    await fn();
    return null;
  } catch (err) {
    return (err as { getStatus?: () => number }).getStatus?.() ?? -1;
  }
}

class FakeTwilio extends TwilioService {
  calls: Array<{ to: string; body: string }> = [];
  on = true;
  fail = false;
  delayMs = 0;
  inFlight = 0;
  maxInFlight = 0;
  override get configured(): boolean {
    return this.on;
  }
  override async send(to: string, body: string): Promise<boolean> {
    if (!this.on) return false;
    this.inFlight++;
    this.maxInFlight = Math.max(this.maxInFlight, this.inFlight);
    if (this.delayMs) await new Promise((r) => setTimeout(r, this.delayMs));
    this.inFlight--;
    this.calls.push({ to, body });
    return !this.fail;
  }
}

const NITS = ['INV-SMOKE-A', 'INV-SMOKE-B'];
const WEB = 'https://nexo.test';

async function cleanup(): Promise<void> {
  const cjs = await prisma.conjunto.findMany({ where: { nit: { in: NITS } }, select: { id: true } });
  const ids = cjs.map((c) => c.id);
  if (!ids.length) return;
  const where = { conjunto_id: { in: ids } };
  await prisma.notification.deleteMany({ where });
  await prisma.unitOccupancy.deleteMany({ where: { unit: where } });
  await prisma.user.deleteMany({ where });
  await prisma.unit.deleteMany({ where });
  await prisma.conjunto.deleteMany({ where: { id: { in: ids } } });
}

async function main(): Promise<void> {
  process.env.APP_URL = `${WEB}/`; // trailing slash on purpose
  await cleanup();
  const ps = new PrismaService();
  const twilio = new FakeTwilio();
  const messenger = new InviteMessenger(ps, twilio);
  const invites = new InvitesService(ps, messenger);

  const mk = (nit: string, name: string) =>
    prisma.conjunto.create({ data: { name, nit, address: '', city: 'Cali', department: '', total_units: 0 } });
  const cjA = await mk(NITS[0], 'Residencia Smoke A');
  const cjB = await mk(NITS[1], 'Residencia Smoke B');
  const admin: AuthUser = { userId: 'inv_admin_a', conjuntoId: cjA.id, unitId: null, role: 'ADMIN', occupancyType: null };
  const adminB: AuthUser = { ...admin, userId: 'inv_admin_b', conjuntoId: cjB.id };
  const N = 40;
  for (let i = 0; i < N; i++) {
    await prisma.unit.create({ data: { conjunto_id: cjA.id, unit_number: String(100 + i), coeficiente: 0, monthly_fee: 0 } });
  }
  const unit100 = await prisma.unit.findFirstOrThrow({ where: { conjunto_id: cjA.id, unit_number: '100' } });
  const resident: AuthUser = { userId: 'inv_res', conjuntoId: cjA.id, unitId: unit100.id, role: 'RESIDENT', occupancyType: 'TENANT' };
  const asA = <T>(fn: () => Promise<T>) => runAsTenant(cjA.id, fn);
  const asB = <T>(fn: () => Promise<T>) => runAsTenant(cjB.id, fn);
  const row = (id: string) => prisma.user.findUniqueOrThrow({ where: { id } });

  // ── 1. Single invite → one message, in the background ────────────────────
  const one = await asA(() => invites.create(admin, { phone: '300 555 0001', role: 'GUARD', fullName: 'Portero Uno' }));
  check('create answers before the message goes out', one.messageQueued === true && twilio.calls.length === 0);
  await messenger.idle();
  const m = twilio.calls[0];
  check('create sends exactly one message to the invited phone', twilio.calls.length === 1 && m?.to === '+573005550001');
  check(
    'message = "<residencia>: te invitaron a Nexo… {APP_URL}/sign-in"',
    m?.body === `Residencia Smoke A: te invitaron a Nexo. Entra con este celular aquí: ${WEB}/sign-in`,
  );
  check('invite_sent_at stamped', (await row(one.id)).invite_sent_at !== null);
  check('nothing written to the in-app notifications feed', (await prisma.notification.count({ where: { conjunto_id: cjA.id } })) === 0);
  const listed = await asA(() => invites.list(admin));
  check('list exposes inviteSentAt', listed.length === 1 && listed[0].inviteSentAt instanceof Date);
  const settings = await asA(() => invites.settings(admin));
  check('settings: conjunto name + automatic on', settings.conjuntoName === 'Residencia Smoke A' && settings.automatic === true);

  // ── 2. Bulk: responds without waiting; low concurrency ───────────────────
  twilio.calls = [];
  twilio.delayMs = 40;
  const rows = Array.from({ length: N }, (_, i) => ({ unitNumber: String(100 + i), phone: `31055501${String(i).padStart(2, '0')}` }));
  rows.push({ unitNumber: '100', phone: '3105550100' }); // duplicate phone → skipped, no message
  rows.push({ unitNumber: '999', phone: '3105559999' }); // unknown unit → error, no message
  const bulk = await asA(() => invites.bulk(admin, rows));
  const sentAtReturn = twilio.calls.length;
  const invited = bulk.results.filter((r) => r.status === 'invited').length;
  check(`bulk invited ${N}, skipped 1, error 1`, invited === N && bulk.results[N].status === 'skipped' && bulk.results[N + 1].status === 'error');
  check(`bulk responded with sends still pending (${sentAtReturn}/${N} done)`, sentAtReturn < N / 2 && messenger.pending > 0);
  await messenger.idle();
  check('every invited row got its message, skipped/error rows none', twilio.calls.length === N);
  check('one message per phone (no duplicates)', new Set(twilio.calls.map((c) => c.to)).size === N);
  check(`background concurrency stays low (max ${twilio.maxInFlight})`, twilio.maxInFlight >= 1 && twilio.maxInFlight <= 2);
  twilio.delayMs = 0;

  // ── 3. Resend: 10-minute cooldown ────────────────────────────────────────
  twilio.calls = [];
  check('resend right after the first send → 429', (await status(() => asA(() => invites.resend(admin, one.id)))) === 429);
  check('…and nothing was sent', twilio.calls.length === 0);
  const ago = (min: number) => new Date(Date.now() - min * 60_000);
  await prisma.user.update({ where: { id: one.id }, data: { invite_sent_at: ago(9) } });
  check('resend after 9 min → still 429', (await status(() => asA(() => invites.resend(admin, one.id)))) === 429);
  await prisma.user.update({ where: { id: one.id }, data: { invite_sent_at: ago(11) } });
  const re = await asA(() => invites.resend(admin, one.id));
  check('resend after 11 min → sent', re.sent === true && twilio.calls.length === 1 && twilio.calls[0].to === '+573005550001');
  check('resend refreshes invite_sent_at', Date.now() - (await row(one.id)).invite_sent_at!.getTime() < 60_000);
  check('second resend in a row → 429', (await status(() => asA(() => invites.resend(admin, one.id)))) === 429);
  await prisma.user.update({ where: { id: one.id }, data: { invite_sent_at: ago(11) } });
  const both = await Promise.all([1, 2].map(() => status(() => asA(() => invites.resend(admin, one.id)))));
  check('two simultaneous resends → only one goes out', both.filter((s) => s === null).length === 1 && twilio.calls.length === 2);

  // ── 4. Who may resend ────────────────────────────────────────────────────
  await prisma.user.update({ where: { id: one.id }, data: { invite_sent_at: ago(30) } });
  twilio.calls = [];
  check('resident cannot resend (403)', (await status(() => asA(() => invites.resend(resident, one.id)))) === 403);
  check('admin of another conjunto cannot resend (404, same as unknown id)', (await status(() => asB(() => invites.resend(adminB, one.id)))) === 404);
  check('…neither attempt sent or stamped anything', twilio.calls.length === 0 && Date.now() - (await row(one.id)).invite_sent_at!.getTime() > 29 * 60_000);
  await asA(() => invites.revoke(admin, one.id));
  check('revoked invitation cannot be resent', (await status(() => asA(() => invites.resend(admin, one.id)))) === 404);
  const claimed = await prisma.user.create({
    data: { conjunto_id: cjA.id, external_auth_id: 'inv_claimed', full_name: 'Ya entró', phone: '+573005550009', role: 'GUARD' },
  });
  check('already-claimed user is not an invitation (404)', (await status(() => asA(() => invites.resend(admin, claimed.id)))) === 404);

  // ── 5. Provider failures stay honest ─────────────────────────────────────
  twilio.fail = true;
  const fa = await asA(() => invites.create(admin, { phone: '3005550002', role: 'GUARD' }));
  // Enqueued from tenant B while the pool is busy with A's job.
  const fb = await asB(() => invites.create(adminB, { phone: '3005550003', role: 'GUARD' }));
  await messenger.idle();
  check('failed background send clears invite_sent_at (both tenants)', (await row(fa.id)).invite_sent_at === null && (await row(fb.id)).invite_sent_at === null);
  const before = ago(20);
  await prisma.user.update({ where: { id: fa.id }, data: { invite_sent_at: before } });
  check('failed resend → 503', (await status(() => asA(() => invites.resend(admin, fa.id)))) === 503);
  check('…and the previous timestamp is restored', (await row(fa.id)).invite_sent_at?.getTime() === before.getTime());
  twilio.fail = false;

  // ── 6. Twilio not configured → graceful no-op ────────────────────────────
  twilio.on = false;
  twilio.calls = [];
  const off = await asA(() => invites.create(admin, { phone: '3005550004', role: 'GUARD' }));
  await messenger.idle();
  check('unconfigured: invitation still created, nothing queued or stamped', off.messageQueued === false && (await row(off.id)).invite_sent_at === null);
  const offRe = await asA(() => invites.resend(admin, off.id));
  check('unconfigured: resend reports not_configured (no error, no stamp)', offRe.sent === false && (await row(off.id)).invite_sent_at === null && twilio.calls.length === 0);
  twilio.on = true;
  delete process.env.APP_URL;
  check('no APP_URL → automatic sending is off (no link to send)', (await asA(() => invites.settings(admin))).automatic === false);

  await cleanup();
  const failed = results.filter(([, ok]) => !ok);
  console.log(`\nInvites smoke: ${failed.length === 0 ? 'PASS ✅' : `FAIL ❌ (${failed.length})`}`);
  await prisma.$disconnect();
  if (failed.length) process.exit(1);
}

main().catch(async (err) => {
  console.error(err);
  await cleanup().catch(() => undefined);
  await prisma.$disconnect();
  process.exit(1);
});
