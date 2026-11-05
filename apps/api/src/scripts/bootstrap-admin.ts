/**
 * Bootstrap a Clerk user as ADMIN of a conjunto by writing their publicMetadata.
 *
 * Usage:  node dist/scripts/bootstrap-admin.js <clerkUserId> <conjuntoId>
 *
 * With no/incomplete args it prints the conjuntos in the DB so you can pick an id.
 * Needs CLERK_SECRET_KEY (run with: node --env-file=../../.env dist/scripts/bootstrap-admin.js ...)
 */
import { prisma } from '@nexo/database';

const CLERK_API = 'https://api.clerk.com/v1';

async function listConjuntos(): Promise<void> {
  const conjuntos = await prisma.conjunto.findMany({
    select: { id: true, name: true, city: true },
    orderBy: { created_at: 'asc' },
  });
  if (conjuntos.length === 0) {
    console.log('No conjuntos in the DB yet. Create one via /onboarding first.');
    return;
  }
  console.log('Conjuntos:');
  for (const c of conjuntos) console.log(`  ${c.id}  —  ${c.name} (${c.city})`);
}

async function main(): Promise<void> {
  const [clerkUserId, conjuntoId] = process.argv.slice(2);

  if (!clerkUserId || !conjuntoId) {
    console.log('Usage: node dist/scripts/bootstrap-admin.js <clerkUserId> <conjuntoId>\n');
    await listConjuntos();
    process.exit(clerkUserId || conjuntoId ? 1 : 0);
  }

  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) throw new Error('CLERK_SECRET_KEY not set in environment');

  // Sanity-check the conjunto exists (avoids minting a token for a typo'd id).
  const conjunto = await prisma.conjunto.findUnique({ where: { id: conjuntoId } });
  if (!conjunto) {
    console.error(`Conjunto ${conjuntoId} not found.\n`);
    await listConjuntos();
    process.exit(1);
  }

  // Clerk Backend API merges public_metadata on PATCH /users/:id/metadata.
  const res = await fetch(`${CLERK_API}/users/${clerkUserId}/metadata`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${secret}` },
    body: JSON.stringify({ public_metadata: { conjuntoId, role: 'ADMIN' } }),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Clerk update failed (${res.status}): ${detail}`);
  }

  console.log(`Done — user ${clerkUserId} is now ADMIN of conjunto ${conjuntoId}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
