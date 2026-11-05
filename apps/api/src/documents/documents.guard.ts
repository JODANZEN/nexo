import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';
import type { Document } from '@nexo/database';
import { PrismaService } from '../prisma/prisma.service';
import { canAccessDocument } from './can-access-document';
import type { AuthUser } from '../auth/auth.types';

type RequestWithDoc = Request & { user?: AuthUser; document?: Document };

/**
 * Runs after ClerkAuthGuard on :documentId routes. Fetches the doc and enforces
 * canAccessDocument(). Always 403 on denial OR missing — never 404, which would
 * leak whether a document exists (blueprint 2.2). Attaches the doc to the
 * request so the controller doesn't re-fetch.
 */
@Injectable()
export class DocumentsGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<RequestWithDoc>();
    const user = req.user;
    if (!user) throw new ForbiddenException();

    const raw = req.params.documentId;
    const documentId = Array.isArray(raw) ? raw[0] : raw;
    const doc = documentId
      ? await this.prisma.db.document.findUnique({ where: { id: documentId } })
      : null;

    if (!doc || !canAccessDocument(user, doc)) {
      throw new ForbiddenException('No access to this document');
    }

    req.document = doc;
    return true;
  }
}
