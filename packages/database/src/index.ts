// Shared database package: single Prisma schema + generated client for the monorepo.
export { prisma } from './client';

// Re-export the generated client so consumers get PrismaClient, model types,
// enums (UserRole, PaymentStatus, ...) and the Prisma namespace from one place.
export * from '@prisma/client';

// Shared Cloudflare R2 (S3-compatible) client + presigned URL helpers.
export { r2, generatePresignedGetUrl, generatePresignedPutUrl, putObject } from './r2';
