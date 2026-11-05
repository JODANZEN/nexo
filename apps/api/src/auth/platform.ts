import type { AuthUser } from './auth.types';

/**
 * Who may create a new conjunto.
 *  - PLATFORM_ADMIN_USER_IDS: comma-separated Clerk user ids of the Nexo team.
 *  - ALLOW_SELF_SERVE_SIGNUP=true reopens self-serve (anyone signed in), the old
 *    behaviour. Default is closed: Nexo is sold via demo, and an open door meant any
 *    stranger could become ADMIN of a fresh conjunto.
 */
export function isPlatformAdmin(user: AuthUser): boolean {
  const ids = (process.env.PLATFORM_ADMIN_USER_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  return ids.includes(user.userId);
}

export function canCreateConjunto(user: AuthUser): boolean {
  return process.env.ALLOW_SELF_SERVE_SIGNUP === 'true' || isPlatformAdmin(user);
}
