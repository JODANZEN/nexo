import type { ExecutionContext } from '@nestjs/common';
import type { ThrottlerModuleOptions } from '@nestjs/throttler';

// Rate limits (2026-11 security review). Two counters per request, both per minute:
//  - "ip":   per client IP (Railway's X-Forwarded-For; main.ts sets `trust proxy` = 1)
//  - "user": per Clerk user (JWT `sub`), so people behind one office/residence NAT
//            don't share a budget. The JWT is only DECODED here for the key; it is
//            verified later by ClerkAuthGuard. A forged `sub` can't get past the
//            per-IP counter and is rejected with 401 anyway.
// Storage is in-memory (one Railway instance). If the API scales out, pass
// `storage: new ThrottlerStorageRedisService(redis)` (@nest-lab/throttler-storage-redis).
export const IP_LIMIT_PER_MIN = 600;
export const USER_LIMIT_PER_MIN = 300; // panel + chunked imports (5–10 calls) fit easily
export const PUBLIC_LINK_LIMIT_PER_MIN = 10; // one-time entry links, per IP
export const PQR_CREATE_LIMIT_PER_MIN = 30; // new tickets, per user

type Req = { ip?: string; headers?: Record<string, string | string[] | undefined> };

export function ipTracker(req: Record<string, unknown>): string {
  return `ip:${(req as Req).ip ?? 'unknown'}`;
}

export function userTracker(req: Record<string, unknown>): string {
  const auth = (req as Req).headers?.authorization;
  const token = typeof auth === 'string' && auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (token) {
    try {
      const payload = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8')) as { sub?: unknown };
      if (typeof payload.sub === 'string' && payload.sub.length < 100) return `user:${payload.sub}`;
    } catch {
      /* fall through to IP */
    }
  }
  return ipTracker(req);
}

export const throttlerOptions: ThrottlerModuleOptions = {
  throttlers: [
    { name: 'ip', ttl: 60_000, limit: IP_LIMIT_PER_MIN, getTracker: ipTracker },
    { name: 'user', ttl: 60_000, limit: USER_LIMIT_PER_MIN, getTracker: userTracker },
  ],
  errorMessage: (_ctx: ExecutionContext) => 'Demasiadas solicitudes en poco tiempo. Espera un minuto e intenta de nuevo.',
};

/** For @SkipThrottle: skip every named throttler. */
export const SKIP_ALL = { ip: true, user: true };
