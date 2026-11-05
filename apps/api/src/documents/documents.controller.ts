import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import {
  DocumentStatus,
  DocumentVisibility,
  generatePresignedGetUrl,
  putObject,
  type Document,
} from '@nexo/database';
import type { PresignedUrlResponse } from '@nexo/types';
import { PrismaService } from '../prisma/prisma.service';
import { ClerkAuthGuard } from '../auth/clerk-auth.guard';
import { DocumentsGuard } from './documents.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import type { AuthUser } from '../auth/auth.types';

const PRESIGNED_TTL_SECONDS = 300;

type UploadBody = {
  title?: string;
  description?: string;
  unitId?: string;
  visibility?: string;
};

@Controller('documents')
@UseGuards(ClerkAuthGuard)
export class DocumentsController {
  constructor(private readonly prisma: PrismaService) {}

  // List documents the user may access (filtered at the WHERE clause, never post-fetch).
  // Per-document access is still re-checked by DocumentsGuard when a presigned URL is requested.
  @Get()
  async list(@CurrentUser() user: AuthUser) {
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    const where =
      user.role === 'ADMIN'
        ? { conjunto_id: user.conjuntoId, status: DocumentStatus.ACTIVE }
        : {
            conjunto_id: user.conjuntoId,
            status: DocumentStatus.ACTIVE,
            OR: [
              { visibility: { in: [DocumentVisibility.ALL_RESIDENTS, DocumentVisibility.PUBLIC] } },
              {
                unit_id: user.unitId,
                visibility: { in: [DocumentVisibility.UNIT_OCCUPANT, DocumentVisibility.UNIT_OWNER] },
              },
            ],
          };
    const docs = await this.prisma.db.document.findMany({
      where,
      orderBy: { created_at: 'desc' },
      select: { id: true, title: true, visibility: true, file_size_bytes: true, created_at: true },
    });
    return docs.map((d) => ({
      documentId: d.id,
      title: d.title,
      visibility: d.visibility,
      fileSizeBytes: d.file_size_bytes,
      createdAt: d.created_at,
    }));
  }

  // 2.2 — Admin uploads a PDF. Streams the in-memory buffer to R2, then records
  // the Document. Never returns r2_key. Multer (module config) enforces PDF + 10MB.
  @Post('upload')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @UploadedFile() file: Express.Multer.File | undefined,
    @CurrentUser() user: AuthUser,
    @Body() body: UploadBody,
  ): Promise<{ documentId: string; title: string; createdAt: Date }> {
    if (user.role !== 'ADMIN') throw new ForbiddenException();
    if (!user.conjuntoId) throw new ForbiddenException('Token has no conjuntoId');
    if (!file) throw new BadRequestException('file is required');
    if (!body.title?.trim()) throw new BadRequestException('title is required');

    const visibility = parseVisibility(body.visibility);
    const unitId = body.unitId?.trim() || null;
    if (unitId) {
      const unit = await this.prisma.db.unit.findUnique({ where: { id: unitId }, select: { conjunto_id: true } });
      if (!unit || unit.conjunto_id !== user.conjuntoId) throw new BadRequestException('Invalid unitId');
    }

    // Resolve the Clerk sub to a User row — uploaded_by_id is an FK to users.id,
    // not the Clerk id. 404 if the user hasn't been provisioned yet.
    const dbUser = await this.prisma.db.user.findUnique({
      where: { external_auth_id: user.userId },
    });
    if (!dbUser) throw new NotFoundException('User not provisioned');

    // Create first (status PENDING_UPLOAD) to get the id the R2 key needs, then
    // upload, then flip to ACTIVE with the real key. A failed upload leaves a
    // PENDING_UPLOAD row, never a row pointing at a missing object.
    const created = await this.prisma.db.document.create({
      data: {
        conjunto_id: user.conjuntoId,
        unit_id: unitId,
        uploaded_by_id: dbUser.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        r2_key: `pending:${randomUUID()}`,
        mime_type: 'application/pdf',
        file_size_bytes: file.size,
        visibility,
        status: 'PENDING_UPLOAD',
      },
    });

    const filename = safeFilename(file.originalname);
    const r2Key = `conjuntos/${user.conjuntoId}/units/${unitId ?? 'common'}/documents/${created.id}/${filename}`;
    await putObject(r2Key, file.buffer);

    const doc = await this.prisma.db.document.update({
      where: { id: created.id },
      data: { r2_key: r2Key, status: 'ACTIVE' },
    });

    return { documentId: doc.id, title: doc.title, createdAt: doc.created_at };
  }

  // 2.3 — Presigned GET. DocumentsGuard already ran RBAC and attached the doc.
  // URL is generated fresh, never stored, expires in 300s.
  @Get(':documentId/url')
  @UseGuards(DocumentsGuard)
  async getUrl(
    @Param('documentId') _documentId: string,
    @CurrentUser() user: AuthUser,
    @Req() req: Request & { document?: Document },
  ): Promise<PresignedUrlResponse> {
    const doc = req.document!; // guaranteed by DocumentsGuard
    const url = await generatePresignedGetUrl(doc.r2_key, PRESIGNED_TTL_SECONDS);
    const expiresAt = new Date(Date.now() + PRESIGNED_TTL_SECONDS * 1000).toISOString();

    await this.prisma.db.documentAccessLog.create({
      data: {
        document_id: doc.id,
        accessed_by: user.userId,
        ip_address: req.ip ?? null,
        user_agent: req.headers['user-agent'] ?? null,
      },
    });

    return { url, expiresAt, documentId: doc.id, title: doc.title };
  }
}

function parseVisibility(value: string | undefined): DocumentVisibility {
  if (value == null) return DocumentVisibility.ADMIN_ONLY;
  if (value in DocumentVisibility) return value as DocumentVisibility;
  throw new BadRequestException(`Invalid visibility: ${value}`);
}

function safeFilename(original: string): string {
  const base = (original.split(/[/\\]/).pop() || 'document').replace(/[^\w.\-]+/g, '_');
  return base.toLowerCase().endsWith('.pdf') ? base : `${base}.pdf`;
}
