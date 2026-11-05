Read CLAUDE.md before doing anything.

This is a **functional audit** — not new feature work. Your job is to verify the app can hold real data end-to-end and identify anything broken before we deploy.

## What to check

### 1. Build
- Run `npm run build` from repo root. List any TypeScript errors or build failures. Fix them.
- Run `npx tsc --noEmit` inside `apps/api` and `apps/web`. Fix any errors found.

### 2. Database
- Verify all Prisma migrations are in sync: `cd packages/database && npx prisma migrate status`
- If there are pending migrations, apply them: `npx prisma migrate dev`
- Run the seed: `npm run db:seed --workspace @nexo/database` and confirm it succeeds

### 3. API smoke tests (run against Neon)
Run each smoke test in order with `node --env-file=../../.env`:
- `node apps/api/dist/smoke.js` (Phase 3 — billing + Wompi)
- `node apps/api/dist/smoke-phase4.js` (Phase 4 — PQR + Inspection)
- `node apps/api/dist/smoke-phase5.js` (Phase 5 — Portería)
- `node apps/api/dist/smoke-phase6.js` (Phase 6 — Asamblea)

For each test, report: PASS or FAIL. If FAIL, fix the issue and re-run.

### 4. API endpoint check
Start the API (`npm run start --workspace @nexo/api`) then curl these routes and confirm they return valid JSON (not 500):
- `GET /api/health`
- `GET /api/billing/units` (may return 401 without auth — that's fine, means the route exists)
- `GET /api/documents` (same)
- `GET /api/pqrs` (same)
- `GET /api/asambleas` (same)
- `GET /api/parking/spots` (same — new Phase 9 route)
- `GET /api/contabilidad/cuentas-por-cobrar` (same)
- `POST /api/iris/chat` with body `{"message":"hola"}` (will 401 — fine)

Report each route: OK (got 200 or 401) vs BROKEN (got 404 or 500).

### 5. Missing stubs
Check if any sidebar nav links in `apps/web/components/dashboard/sidebar.tsx` point to routes that don't have a `page.tsx`. If any are missing, create minimal stub pages (just an `<h1>` + `export const dynamic = 'force-dynamic'`).

Check the same for portal nav in `apps/web/components/portal/portal-nav.tsx`.

### 6. Environment variable audit
Read `.env.example` and list every variable. For each, mark:
- ✅ Set in `.env` (don't print the value, just confirm it's non-empty)
- ❌ Missing or empty in `.env`

### 7. Summary report
After all checks, print a table:

| Check | Status | Notes |
|-------|--------|-------|
| Build | ✅/❌ | ... |
| Migrations | ✅/❌ | ... |
| Smoke tests | ✅/❌ | ... |
| API routes | ✅/❌ | ... |
| UI stubs | ✅/❌ | ... |
| Env vars | ✅/❌ | missing: [...] |

**Only after all checks pass** print: `✅ APP IS READY FOR DEPLOYMENT`
If anything failed, print: `⚠️ X issues need fixing before deploy`
