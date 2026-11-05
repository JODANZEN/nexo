import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { verifyToken } from '@clerk/backend';
import type { Request } from 'express';
import { AuthUser } from './auth.types';
import { setCurrentTenant } from '../tenancy/tenant-context';

type RequestWithUser = Request & { user?: AuthUser };

/**
 * Verifies a Clerk-issued JWT and attaches { userId, conjuntoId, unitId, role }
 * to req.user. Clerk's publicMetadata (set during admin onboarding) carries the
 * conjuntoId / unitId / role claims.
 */
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithUser>();

    const token = extractBearerToken(request);
    if (!token) {
      throw new UnauthorizedException('Missing or malformed Authorization header');
    }

    const secretKey = process.env.CLERK_SECRET_KEY;
    if (!secretKey) {
      throw new UnauthorizedException('Server auth is not configured (CLERK_SECRET_KEY missing)');
    }

    let payload: Record<string, unknown>;
    try {
      payload = (await verifyToken(token, { secretKey })) as unknown as Record<string, unknown>;
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    // Custom claims may live under `publicMetadata` (Clerk JWT template) or at
    // the top level of the token, depending on how the template is configured.
    const metadata = (payload.publicMetadata ?? payload.public_metadata ?? {}) as Record<
      string,
      unknown
    >;

    request.user = {
      userId: String(payload.sub ?? ''),
      conjuntoId: pickClaim(metadata, payload, 'conjuntoId'),
      unitId: pickClaim(metadata, payload, 'unitId'),
      role: pickClaim(metadata, payload, 'role'),
      occupancyType: pickClaim(metadata, payload, 'occupancyType'),
    };
    // Scope every DB query of this request to the caller's conjunto (Postgres RLS).
    setCurrentTenant(request.user.conjuntoId);

    return true;
  }
}

function pickClaim(
  metadata: Record<string, unknown>,
  payload: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key] ?? payload[key];
  return value == null ? null : String(value);
}

function extractBearerToken(req: Request): string | null {
  const header = req.headers['authorization'];
  if (!header) return null;
  const [scheme, token] = header.split(' ');
  return scheme === 'Bearer' && token ? token : null;
}
