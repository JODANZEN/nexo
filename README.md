# Nexo

Gestión de conjuntos residenciales y residencias estudiantiles en Colombia (Propiedad Horizontal).
Monorepo Turborepo: `apps/api` (NestJS), `apps/web` (Next.js, panel + portal), `apps/site` (sitio de ventas),
`packages/database` (Prisma). Contexto completo para desarrollo: [`CLAUDE.md`](CLAUDE.md).
Seguridad: [`docs/security-review-2026-11.md`](docs/security-review-2026-11.md).

## Local

```bash
npm install
cp .env.example .env            # llena las claves
npm run build -w @nexo/database
npm run dev                     # api :3001 · web :3000 · site :3002
```

## Deploy

| Qué | Dónde | Cómo |
|---|---|---|
| API | Railway | Conectado a este repo, rama `main`. `railway.json` construye y corre `prisma migrate deploy` antes de cada deploy. |
| Panel + portal | Vercel (proyecto `nexo`) | Root del repo; `vercel.json` construye `@nexo/web`. |
| Sitio de ventas | Vercel (proyecto aparte) | Root Directory `apps/site`. |

CI (`.github/workflows/ci.yml`) compila todo, aplica migraciones en un Postgres limpio y corre las pruebas
(`smoke*`, seguridad y RLS) en cada push y PR.

**Nunca subas `.env`** — está en `.gitignore`. Las variables van en Railway / Vercel.
