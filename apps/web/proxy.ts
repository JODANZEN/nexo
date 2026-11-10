import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

// /autorizar/:token = one-time entry-approval link from SMS/WhatsApp (no login).
const isPublic = createRouteMatcher(['/', '/sign-in(.*)', '/sign-up(.*)', '/autorizar(.*)']);
const isOnboarding = createRouteMatcher(['/onboarding(.*)']);
const isDashboard = createRouteMatcher(['/dashboard(.*)']);
const isPortal = createRouteMatcher(['/portal(.*)']);
const isTareas = createRouteMatcher(['/tareas(.*)']);
// Portería (GUARD) works only here: the guard hub (+ parqueaderos under it) and the read-only notice board.
const isGuardArea = createRouteMatcher(['/dashboard/porteria(.*)', '/dashboard/anuncios']);

export default clerkMiddleware(async (auth, req) => {
  if (isPublic(req)) return;

  const { userId, sessionClaims, redirectToSignIn } = await auth();
  if (!userId) return redirectToSignIn();

  // Pull conjuntoId + role from the session token's publicMetadata (or top-level).
  const claims = sessionClaims as Record<string, unknown> | null | undefined;
  const meta = ((claims?.publicMetadata ?? claims?.public_metadata) ?? {}) as Record<string, unknown>;
  const conjuntoId = meta.conjuntoId ?? claims?.conjuntoId ?? null;
  const role = (meta.role ?? claims?.role ?? null) as string | null;

  // /onboarding needs auth but NOT a conjuntoId (new users land here).
  if (isOnboarding(req)) return;

  // Everything else needs a conjuntoId — otherwise send the user to onboarding.
  if (!conjuntoId) return NextResponse.redirect(new URL('/onboarding', req.url));

  // Role-based areas: RESIDENT → /portal. ADMIN lands on /dashboard by default but
  // may also open /portal (demo/preview of the resident experience).
  if (role === 'RESIDENT' && (isDashboard(req) || isTareas(req))) {
    return NextResponse.redirect(new URL('/portal', req.url));
  }
  // Operations staff only work their assigned tasks (phone-first app).
  if (role === 'STAFF' && !isTareas(req)) {
    return NextResponse.redirect(new URL('/tareas', req.url));
  }
  // Guards stay in Portería: no other dashboard screen, no /portal, no /tareas.
  if (role === 'GUARD' && !isGuardArea(req)) {
    return NextResponse.redirect(new URL('/dashboard/porteria', req.url));
  }

  return;
}, { signInUrl: '/sign-in', signUpUrl: '/sign-in' });

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
};
