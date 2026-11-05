import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { tenantContextMiddleware } from './tenancy/tenant-context';
import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  // rawBody: true so the Wompi webhook can HMAC-verify the exact bytes received.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Unit / resident CSV imports (≈1,500 rows) exceed the 100 kb default.
  app.useBodyParser('json', { limit: '2mb' });

  // Standard security headers (nosniff, frame-deny, HSTS, …). JSON API, so CSP is moot.
  app.use(helmet());
  // Opens the per-request tenant store that ClerkAuthGuard fills (Postgres RLS).
  app.use(tenantContextMiddleware);

  // All routes are served under /api (matches docs/execution.md route blueprint)
  app.setGlobalPrefix('api');

  // Allow local dev, the configured web origin (APP_URL), and this team's Vercel
  // deploy/preview URLs. The old pattern (any nexo-*.vercel.app) matched projects
  // that ANYONE on Vercel can create; team-scoped URLs end in the team slug.
  // Extra origins (e.g. a custom domain): CORS_EXTRA_ORIGINS=https://a,https://b
  const staticAllowed = [
    'http://localhost:3000',
    process.env.APP_URL,
    ...(process.env.CORS_EXTRA_ORIGINS ?? '').split(',').map((s) => s.trim()),
  ].filter(Boolean) as string[];
  const vercelOrigin = /^https:\/\/nexo-[a-z0-9-]+-joses-projects-0892e045\.vercel\.app$/;
  app.enableCors({
    origin: (origin: string | undefined, cb: (err: Error | null, allow?: boolean) => void) => {
      // No Origin header = non-browser client (curl, server-to-server) — allow.
      // Disallowed origins get a clean denial (no ACAO header) rather than a 500.
      const ok = !origin || staticAllowed.includes(origin) || vercelOrigin.test(origin);
      cb(null, ok);
    },
    credentials: true,
  });

  const port = process.env.PORT ? Number(process.env.PORT) : 3001;
  await app.listen(port);

  // eslint-disable-next-line no-console
  console.log(`Nexo API listening on port ${port}`);
}

void bootstrap();
