# Nexo — PropTech SaaS for Colombian Propiedad Horizontal

## Project Summary
Nexo is a resident-first property management SaaS for Colombian conjuntos residenciales (Propiedad Horizontal). Think AppFolio/Henri but built for Colombia: PSE/Nequi payments, coeficiente-weighted Asamblea voting, QR visitor access, and Habeas Data (Ley 1581/2012) compliant document storage.

## Stack (non-negotiable — do not suggest alternatives)
- **Monorepo:** Turborepo
- **Backend:** NestJS + TypeScript
- **Frontend:** Next.js 14 (App Router) + shadcn/ui + Tailwind CSS
- **Mobile:** Expo React Native (stub only for now)
- **ORM:** Prisma
- **Database:** PostgreSQL (Neon serverless for dev/staging)
- **Storage:** Cloudflare R2 (S3-compatible, zero egress fees)
- **Auth:** Clerk (SMS OTP is the primary auth method — Colombian residents often lack email)
- **Payments:** Wompi gateway (PSE, Nequi, Corresponsal Bancolombia/Efecty)
- **Queue/Jobs:** BullMQ + Redis (Upstash for dev)
- **PDF Generation:** @react-pdf/renderer or Puppeteer

## Monorepo Structure
```
nexo/
├── apps/
│   ├── api/          ← NestJS backend (port 3001)
│   ├── web/          ← Next.js 14 admin console (port 3000)
│   └── mobile/       ← Expo React Native (stub — do not scaffold yet)
├── packages/
│   ├── database/     ← Prisma schema + generated client (shared by all apps)
│   ├── types/        ← Shared TypeScript interfaces and DTOs
│   └── utils/        ← Colombian helpers: COT timezone, COP math, formatters
├── docs/
│   ├── blueprint.md  ← DB schema, architecture decisions, market analysis
│   └── execution.md  ← Phase roadmap, API spec, billing engine code
├── CLAUDE.md         ← This file
└── .env.example
```

## Domain Glossary (use these exact terms in code)
- **Conjunto** — the residential property entity (top-level tenant)
- **Unidad / Unit** — individual apartment, house, or commercial space
- **Coeficiente** — each unit's ownership share percentage (determines vote weight and fee share)
- **Cuota de administración** — monthly admin fee each unit pays
- **Portería** — security gatehouse / guard station module
- **Asamblea** — HOA assembly / voting session
- **PQR** — Petición, Queja, Reclamo (complaint/request ticket system)
- **Pronto pago** — early payment discount (days 1–10 of billing month)
- **Tarifa plena** — full rate, no adjustment (days 11–EOM)
- **Mora** — late fees that accrue daily after end of billing month
- **Paz y salvo** — clearance certificate showing unit has no outstanding balance

## Critical Coding Rules

### Money (COP)
- ALWAYS use `Decimal.js` for monetary values — never JavaScript `number`
- Store as `DECIMAL(12,2)` in PostgreSQL via Prisma `@db.Decimal(12, 2)`
- Display format: `$ 332.500` (Colombian locale `es-CO`)

### Dates & Timezone
- Colombia is UTC-5 (COT) with NO daylight saving time
- ALWAYS use `America/Bogota` timezone via `@date-fns/tz`
- NEVER use `new Date()` directly in billing logic — use `nowInColombia()` from `packages/utils`
- Billing timeline:
  - Days 1–10: pronto pago (discount applies)
  - Days 11–EOM: tarifa plena (full rate)
  - Day 1 of next month onwards: mora starts accruing

### Multi-Tenancy & Security
- Every DB table has `conjunto_id` — this is the tenant boundary
- Three layers: JWT claim → service checks → **PostgreSQL RLS** (migration `20261102200000_row_level_security`). `ClerkAuthGuard` sets the request's tenant (AsyncLocalStorage, `src/tenancy/tenant-context.ts`); `PrismaService.db` runs every model query of that request as role `nexo_rls` with `app.conjunto_id` set. Crons/workers/webhooks have no tenant and run as the owner (no RLS). Use interactive `$transaction(async tx => …)` — batch arrays are refused inside requests. Services must STILL filter by `conjunto_id`; any route taking a `unitId` calls `assertUnitAccess()` — admins included.
- New tables with `conjunto_id` need a `tenant_isolation` policy in their migration (copy the RLS migration pattern); run `dist/smoke-rls.js`.
- Client-supplied R2 keys must be validated with `isKeyInPrefix()` before storing or presigning.
- See `docs/security-review-2026-11.md` and run `dist/smoke-security.js` after changes.
- R2 object key format: `conjuntos/{conjuntoId}/units/{unitId}/documents/{documentId}/{filename}.pdf`
- Presigned URLs expire in 300 seconds — NEVER store them in DB, generate on demand
- On access denial, always return 403 (never 404 — 404 leaks document existence)

### Mora Calculation
- Mora accrues on `base_amount` (original charge), NOT the remaining unpaid balance
- Daily rate = monthly_mora_rate / 30 (Colombian convention)

### Webhook Handling (Wompi)
- Webhook endpoint must return 200 immediately — enqueue with BullMQ, never process inline
- Verify with `PaymentsService.verifyWompiEvent()` — SHA-256 over `signature.properties` values + `timestamp` + WOMPI_EVENTS_KEY, compared to `signature.checksum` / `X-Event-Checksum` (Wompi sends no HMAC header)

## Current Build Phase
**Deployed & working end-to-end (web on Vercel + API on Railway + Neon).** Phases 1–12 done; Portería + Inspections UIs added. Next planned: **Phase 14 — Entitlements/Tiering** (monetization gate), then **Phase 15 — Contabilidad Completo**.

> ⚠️ This section is the reconciled source of truth (updated 2026-07).
> Live URLs: web https://nexo-psi-brown.vercel.app · API https://nexo-production-cd1f.up.railway.app
> **Deploy model:** frontend changes → `vercel --prod --yes`; backend changes → `railway up` (from repo root). Claude can run Vercel (logged in as `jodanzen`) but NOT Railway (interactive login) — backend changes need the user to `railway up`.

### Completed
- [x] **Phase 1 — Foundation:** Turborepo monorepo, Prisma schema + `init` migration, `@nexo/{database,types,utils}`, NestJS API (ClerkAuthGuard, `/health`, `/me`), Next.js 14 web, `.env.example`. Packages build to `dist/`; API runs via `node dist/main.js`.
- [x] **Phase 2 — Document Vault:** R2 client (presigned GET/PUT, `putObject`), `POST /documents/upload`, `GET /documents/:id/url`, `DocumentsGuard` (tenant + visibility RBAC, 403-never-404).
- [x] **Phase 3 — Billing + Wompi:** `BillingService` (`calculateCurrentBalance`, `generateMonthlyCharges`), `GET /billing/units/:unitId/balance`, `POST /payments/links/generate`, `POST /payments/wompi/webhook` (HMAC-verified → BullMQ `reconcile-wompi`). Smoke test passed against Neon.
- [x] **Phase 4 — PQR + Inspection:** PQR CRUD + state machine (`OPEN→IN_REVIEW→RESOLVED→CLOSED`) + comments + BullMQ status-change notifications; Inspection models + migration, room/item capture, presigned-PUT photo flow, submit. Smoke test passed against Neon.
- [x] **Phase 5 — Portería:** Visitor QR generate/scan, walk-in log (AES-256-GCM cédula encryption, Habeas Data gate), delivery log CRUD + pickup + presigned-PUT photo, shared `NotificationsModule`. Smoke test passed against Neon.
- [x] **Phase 6 — Asamblea Voting:** create/agenda/attend (coeficiente snapshot), weighted vote (`vote_hash`, one-per-unit-per-item), live quorum + results tallies, status machine, Acta PDF (`@react-pdf/renderer`) → R2. Smoke test passed against Neon (quorum crossing, 100% tallies, hash, dup-vote 400).
- [x] **Phase 7 — Frontend:** Navy/teal dashboard (now Poppins + full `nexo-*` token system, shadcn-style UI, sidebar + topbar + mobile bottom-nav). Wired pages via TanStack Query (`lib/api.ts` Clerk-JWT fetcher, no raw `fetch()` in components): `/dashboard` (Inicio, real balance/PQR/doc data), `/dashboard/pagos` (cartera table, color-coded, Wompi link), `/dashboard/solicitudes` (+ `[id]` detail/comments/status), `/dashboard/documentos` (upload + presigned "Ver"), `/dashboard/asambleas` (+ `[id]` live quorum bar + vote charts), resident `/mi-cuenta` (balance/pay/docs/PQR/visitor-QR). Added API list endpoints: `GET /billing/units`, `GET /documents`, `GET /asambleas`, `GET /pqrs?status=`. Clerk keys in `apps/web/.env.local`.
- [x] **Phase 7.5 — Resident Portal `/portal`:** consumer-app shell separate from `/dashboard` (top header + bottom tab bar, nexo-teal actions). Role-based middleware (ADMIN→/dashboard, RESIDENT→/portal). 8 pages: Inicio, pagos (+recurring UI), solicitudes (+detail, new-PQR w/ photo), documentos, visitas (full-screen QR), perfil, mas. Backend adds: `GET /payments`, `GET /visitors/qr`, `GET /users/me`, `POST /pqrs/photo-url` + PQR attachments.

### Reconciled roadmap

> **Reality check:** almost every dashboard/portal page IS built and wired to the API.
> They render empty because the JWT does not yet carry `conjuntoId`/`unitId`/`role`
> (Clerk session token not customized — **Phase 11.1**). Fix that first and the existing
> pages light up. "Missing/stub" below = genuinely not built yet.

**Built & wired (DO NOT rebuild):**
- Dashboard: Inicio, Pagos (cartera), Solicitudes (+detail/comments/status), Asambleas (+detail: live quorum + vote charts), Documentos (upload + presigned Ver), Contabilidad Lite (cartera / paz-y-salvo PDF / CSV conciliación), Parqueaderos (live sessions + entry/exit billing), **Portería guard hub** (`/dashboard/porteria`: QR check-in, walk-in log w/ Habeas Data, delivery logging), **Inspecciones** (`/dashboard/inspecciones` + `[id]`: rooms/items/ratings/photos, submit), Propiedades (units + Asignar residente), Comunidad, Reservas, Proveedores, Anuncios, Reportes, Configuración, Iris (chat UI).
- Portal (resident): Inicio (+anuncios feed), Pagos (+recurring mandate UI), Solicitudes (+detail/new w/photo), Documentos, Visitas (QR), Perfil, Más.
- Topbar: Clerk name/role, **notifications bell** (derived feed of recent PQRs+payments, localStorage unread), chat icon → Iris.
- Backend modules: auth/clerk, onboarding (+assign-resident), billing, payments (+recurring + auto-charge BullMQ cron), pqrs, inspections, documents (R2 presigned), visitors, deliveries, asambleas (voting + Acta PDF), parking, contabilidad, iris, notifications, comunidad, reservas, proveedores, anuncios, reportes, configuracion.
- Infra: Neon (migrations in sync, seed works, all 4 smoke tests pass). Web on Vercel + API on Railway, both live. CORS allows `nexo-*.vercel.app`. BullMQ workers tuned low-poll (`LAZY_WORKER_OPTS`) to survive Upstash free-tier request caps.

**Stub tabs remaining:** only Ayuda (help placeholder). Everything else in the sidebar is built.

**⚠️ Gotchas learned in production:**
- **Never run `db:seed` against the live DB** — it wipes rows + remints IDs, orphaning Clerk `publicMetadata` (conjuntoId/unitId point at deleted rows → 404s everywhere). Fix is to repoint metadata (see `scripts/bootstrap-admin.ts` or patch `/v1/users/:id/metadata`).
- **Always visit the app via the production alias** `nexo-psi-brown.vercel.app`, not per-deploy `nexo-<hash>.vercel.app` URLs (CORS regex now allows both, but the alias is canonical).
- **Upstash free tier = 500k Redis req/month.** BullMQ polling can blow it; workers are now low-poll. If it recurs, move `REDIS_URL` to a Railway Redis (not per-request metered).

---

**✅ Phase 8 — Integrations groundwork (code done):** Clerk/R2/Wompi/BullMQ scaffolding wired in code. Live credential testing rolled into later phases.

**✅ Phase 9 — Enhanced Features (done):** RecurringMandate + enroll/status/cancel + auto-charge BullMQ + monthly `@Cron('0 6 1 * *', America/Bogota)` (needs Wompi keys to run live); Parking; Contabilidad Lite; Iris AI (Groq). One consolidated migration `add_phase9`.

**✅ Phase 10 — Production Deployment (done):** Web on Vercel (`vercel.json`) + API on Railway (`railway.json`, service `nexo-production`). Cross-wired: Vercel `NEXT_PUBLIC_API_URL` → Railway URL; Railway `APP_URL` → Vercel URL. Clerk session token customized so the JWT carries `publicMetadata`. (Optional prod Neon branch: not done.)

**✅ Phase 11 — Production Fixes (done — all shipped & live):**
- **11.1 Clerk session token (MANUAL, Clerk dashboard):** Configure → Sessions → Customize token, add `{ "publicMetadata": "{{user.public_metadata}}" }`. THE root cause the app feels empty — without it every authed call is 401/wrong data.
- 11.2 CORS: allow `['http://localhost:3000', process.env.APP_URL].filter(Boolean)` in `apps/api/src/main.ts`.
- 11.3 Admin bootstrap script `apps/api/src/scripts/bootstrap-admin.ts` — sets a Clerk user's publicMetadata to ADMIN via Clerk Backend API; prints existing conjuntos. Native `fetch`, no axios.
- 11.4 Dashboard pages: loading skeletons (`animate-pulse`), visible error states, "Sin datos aún" empty states. (Inicio, pagos, solicitudes, asambleas, documentos, iris, contabilidad, parking.)
- 11.5 Greeting from Clerk `useUser().firstName` (not API) on dashboard + portal Inicio.
- 11.6 Portal pages: same loading/error/empty pattern; `/portal/visitas` handles null `unitId` ("Tu unidad aún no está configurada…").
- 11.7 Iris graceful: try/catch in `iris.service.ts`, never 500 — return a "Iris no disponible / configura GROQ_API_KEY" reply.
- 11.8 Onboarding → Clerk metadata sync: `OnboardingService.provision()` already calls `syncMetadata(...'ADMIN')` — **VERIFY it fires end-to-end from the live `/onboarding` flow** (likely already works; confirm, don't duplicate).
- 11.9 Resident assignment: `POST /units/:unitId/assign-resident` (DB user + Clerk metadata RESIDENT) + "Asignar residente" modal in `/dashboard/propiedades`.

**✅ Phase 12 — Dashboard Feature Buildout (done):** migration `add_phase12` (Amenity, Reservation, Provider, Announcement). New Nest modules + dashboard pages, all using shared `components/ui/states.tsx` (Skeleton/ErrorState/EmptyState):
- **Comunidad** — `GET /comunidad/directory` (users + active unit); directory table.
- **Reservas** — `Amenity` + `Reservation`; amenities CRUD, reservations with overlap conflict check, cancel; dashboard page (admin adds zonas, anyone reserves).
- **Proveedores** — `Provider` list/create/delete; dashboard table + modal.
- **Anuncios** — `Announcement` list/create/delete (residents read, admin writes); dashboard page + surfaced in portal Inicio (`/anuncios?take=3`).
- **Reportes** — `GET /reportes/overview` (recaudo %, PQR by status, mora aging); stat cards + CSS bars (no chart lib).
- **Configuración** — `GET/PATCH /configuracion` (conjunto profile + mora/pronto/parking rates); dashboard form.
> Note: these endpoints are live in code but only reachable once the API is deployed (Phase 10 Railway step). Until then the new pages show their error states.

**⏸ Phase 13 — Wompi live (DEFERRED by user — needs more login/keys):** real payment-link E2E, recurring enrollment via Wompi widget (client-side card tokenization), webhook reconciliation against sandbox, auto-charge cron live, XLSX bank conciliación.

**✅ Phase 14 — Entitlements / Tiering (scaffold DONE):** migration `add_entitlements` added `plan`/`plan_status`/`feature_overrides` to Conjunto (existing conjunto set to PREMIUM for dev). Registry in `packages/types/src/entitlements.ts` (`FEATURE_MIN_TIER`, `hasFeature`, `resolveEntitlements`). Backend: `GET /me/entitlements` (source of truth — **no Clerk mirror**, per Fable's note), `@RequiresFeature(key)` + `FeatureGuard` (runs after ClerkAuthGuard, hard-denies null conjuntoId, 403 `{code:'PLAN_REQUIRED',feature,minTier}`); **asambleas** gated as the template. Frontend: `useEntitlements()` hook + sidebar locks gated items (🔒, links to configuración) — optimistic (no lock flash while loading; degrades open if `/me/entitlements` unreachable). To gate more modules: add `@UseGuards(ClerkAuthGuard, FeatureGuard)` + `@RequiresFeature('<key>')` to the controller and a `feature:` on the sidebar item. Remaining for full Phase 14: gate the other PRO controllers (reservas/parking/inspecciones/reportes/iris/recurring), a real upgrade/billing page, `plan_status` PAST_DUE handling, cron/queue re-checks (auto-charge = PRO), and validate `feature_overrides` expiry.
Original scaffold intent (kept for reference):
- **Data:** add to `Conjunto` → `plan ('BASIC'|'PRO'|'PREMIUM')`, `plan_status ('ACTIVE'|'TRIAL'|'PAST_DUE')`, `feature_overrides Json?` (per-building à-la-carte / trials). Migration.
- **Entitlements registry** (shared in `packages/types`): map feature keys → min tier, e.g. `asambleas → PRO`, `contabilidad.completo → PRO`, `contabilidad.exogena → PREMIUM`, `iris.unlimited → PREMIUM`.
- **Backend gate (authoritative):** `@RequiresFeature('key')` decorator + `FeatureGuard` → loads conjunto plan, 403/402 with upgrade hint. Never trust client.
- **Frontend UX:** `useEntitlements()` hook → hide/lock nav items, "Plan Pro 🔒 — Mejorar" prompts on gated features. Mirror `plan` into Clerk `publicMetadata` for cheap client checks (backend stays source of truth).
- `feature_overrides` grants a single conjunto a feature/trial without changing tier.

**Tier matrix (validate pricing with the user):**
| Feature set | BASIC (Esencial) | PRO (Profesional) | PREMIUM |
|---|---|---|---|
| Pagos/cartera, PQR, documentos, comunidad, anuncios, portal residente, portería básica (QR+visitas), configuración, Contabilidad **Lite** | ✅ | ✅ | ✅ |
| Asambleas/voting, reservas, parqueaderos, inspecciones, reportes avanzados, recurring payments, Iris (limitado), **Contabilidad completo** | — | ✅ | ✅ |
| **Facturación electrónica DIAN**, nómina electrónica, información exógena, revisor fiscal, multi-torre, API, Iris ilimitado, push | — | — | ✅ |
> Logic: BASIC = what a conjunto legally/operationally can't run without. PREMIUM = compliance-heavy or high-run-cost features (DIAN e-invoicing, exógena, unlimited AI, push) that justify the price jump.

**🔜 Phase 15 — Contabilidad Completo (flagship PRO feature):** on top of the existing Lite (cartera / paz-y-salvo / conciliación / mora):
- Plan Único de Cuentas (PUC) chart of accounts + libro diario & mayor.
- Presupuesto anual (approved by asamblea) vs. ejecución presupuestal.
- Estados financieros: situación financiera (balance) + resultados (P&L) — NIIF **Grupo 3 (microempresas)**.
- Egresos/proveedores with **retención en la fuente** + comprobantes de egreso.
- **Fondo de imprevistos** ledger (Ley 675 art. 35, min ~1% of cuotas — segregate & track).
- `REVISOR_FISCAL` read-only role (enum already exists) — dashboards + exports.

**🔜 Phase 16 — DIAN e-invoicing & tax compliance (PREMIUM — highest effort/risk, build LAST):**
> ⚠️ Colombian tax rules change yearly (UVT, thresholds, resolution numbers) and Claude can't pull live DIAN resolutions. **All filing/e-invoicing logic must be validated with a contador/revisor fiscal before coding.** Scaffold only below.
- **Taxpayer status:** residential-only copropiedades are generally *non-contribuyentes* on cuotas (a *cuenta de cobro*/documento soporte suffices — NOT factura electrónica). Commercial/mixed use that exploits common areas (parqueadero a terceros, arriendo de zonas, antenas, publicidad) loses non-taxpayer status on that income (ET art. 19-5, Ley 1819/2016 art. 143) → must declarar renta/ICA + issue **factura electrónica** for it.
- **Facturación electrónica** (Res. 000042/2020 & successors) — only for that commercial income; requires a certified **Proveedor Tecnológico** or direct DIAN habilitación (real integration, not a checkbox).
- **Documento soporte de nómina electrónica** (Res. 000013/2021) — if they directly employ porteros/aseo.
- **Documento soporte** on purchases to no-obligados a facturar.
- **Retención en la fuente** as agente retenedor (track + certify) — overlaps Phase 15.
- **Información exógena** (medios magnéticos) — annual DIAN report if thresholds met.
- **Revisor fiscal obligatorio** for commercial/mixed copropiedades (Ley 675 art. 56).

**Sequencing:** 14 (gate scaffold — makes tiers real with existing features) → 15 (Contabilidad Completo, the PRO anchor) → 16 (DIAN, contador-validated, PREMIUM).

**🎯 City U — design-partner track (CURRENT PRIORITY, see user memory `cityu-design-partner`):** Prospect = student-residence operator. Pilot **Cali (300 rooms, 2 types)** → **City U (1,500 rooms, 14 types)**; separate account per building (multi-property/portfolio deferred). #1 pain = **ticket response time + resolution**, root cause = resident reachability. Strategy: own the resident-response loop; *integrate* their stack (**HubSpot** CRM, **Siigo** accounting, **DocuSign** e-sign); *replace* the **Nuvola** resident-ops layer they dislike.

**🔜 Phase 17 — Fast-Ticket Loop (flagship, build first):** extend the PQR module — priority + **SLA timers** (first_response_at / resolved_at + targets + breach alerts); **ticket taxonomy** (IN_UNIT / FACILITY / INTERNAL_OPS); **assignment/routing** to staff/teams; **real multi-channel notifications (push + email + SMS)** replacing the BullMQ console stub, with reminders/escalation on resident non-response; **entry-authorization workflow** (access-to-unit request tied to a ticket → resident approves via app/SMS link → time-bound logged grant — ties tickets + portería + notify).

**🔜 Phase 18 — Structure + Traceability:** `RoomType` catalog per conjunto (units belong to a type; Cali 2 / City U 14); resident/unit **timeline** (audit + tickets + payments + visits, searchable) surfacing the existing `AuditLog`.

**🔄 Phase 19 — Integrations (provider-adapter layer built; live where creds exist):** `src/integrations/` (@Global `IntegrationsModule`) — every adapter is a graceful no-op until its env keys are set. **Twilio** (WhatsApp→SMS) wired into `NotificationsService.deliver` (completes the reachability loop). **HubSpot** contact upsert wired into resident assignment. **Siigo** (auth implemented; invoice/receipt/tercero push TODO — needs client catalog ids) and **DocuSign** (skeleton; JWT + templates TODO) await City U's credentials from the discovery engagement. Env keys in `.env.example` (RESEND/EMAIL_FROM, TWILIO_*, HUBSPOT_TOKEN, SIIGO_*, DOCUSIGN_*). Gate CRM/accounting/e-sign behind the PREMIUM entitlement when turned on.

**✅ Operations (2026-11, migration `operations`) — City U pilot gaps:**
- **Units import:** `POST /units` · `POST /units/bulk` (upsert by number, creates missing room types, COP "1.250.000" parsing, one RLS transaction) · `PATCH /units/:id`. UI: Propiedades → Agregar / Importar (chunked 300 rows).
- **STAFF role + auto-assignment:** invite role `STAFF` (+ `team`); STAFF sees only assigned tickets, can't CLOSE, lands on `/tareas` (phone-first). `PqrRoutingRule` (category/scope → candidates, least open tickets wins). `/operations/team`, `/operations/routing-rules`.
- **Per-client SLA + business hours:** `conjuntos.sla_config` / `business_hours` (`src/pqrs/sla.ts`: business-time math, Colombian festivos incl. Ley Emiliani). Escalation fractions measured on the ticket's own clock; first-response breach alerts once. UI: `/dashboard/operacion`.
- **Entry authorization:** `EntryAuthorization` per ticket → resident approves in portal or via one-time link `/autorizar/:token` (token hashed; link only in SMS/WhatsApp/email, never in the DB feed; needs `APP_URL`). Request pauses the ticket; decision resumes it. Portería card lists approved entries, "Registrar ingreso" is audited.
- **Preventive maintenance:** `MaintenancePlan` (every N days/weeks/months, lead days) → daily cron 05:30 COT creates MAINTENANCE tickets (idempotent conditional claim). UI: `/dashboard/mantenimiento`.
- Tests: `dist/smoke-ops.js` (37 checks, in CI). All ticket creation goes through `PqrsService.createInternal()`.

**✅ Nov 10 — reachability, install, limits, area views:**
- **Invitation message:** creating an invite queues an SMS/WhatsApp with `{APP_URL}/sign-in` (`onboarding/invite-messenger.ts`, in-memory queue, concurrency 2, no feed row); `POST /invites/:id/resend` (10-min cooldown via `users.invite_sent_at`); manual WhatsApp/copy links; printable QR poster `/dashboard/propiedades/afiche`. `smoke-invites`.
- **Installable web app:** `app/manifest.ts`, icons in `public/` (`scripts/generate-icons.mjs`), install invitation on `/portal` and `/tareas`. No service worker on purpose (no caching of personal data).
- **Rate limiting:** `@nestjs/throttler` global (`src/security/throttling.ts`): 600/min per IP + 300/min per Clerk user; public entry links 10/min per IP; `POST /pqrs` 30/min; `/health` + Wompi webhook exempt; `trust proxy` = 1.
- **Area views:** GUARD is confined to Portería (+ parqueaderos, anuncios) in `proxy.ts`/sidebar. `users.is_team_lead` (STAFF): "Mi equipo" tab in `/tareas`, can work and reassign tickets within their `team`, gets level-2/3 escalations. Admin: `GET /pqrs?team=&assignee=`, `GET /operations/team-summary`, per-team summary + filters in Solicitudes. `smoke-areas`.

**Revised priority:** City U track (17 → 18 → 19) now leads. Contabilidad Completo (15) folds into the Siigo integration story; DIAN (16) and Wompi (13) remain deferred.

**Frontend conventions:** shadcn/ui components throughout; TanStack Query for all API calls (cache + refetch on focus); no raw `fetch()` in components. Web reads `NEXT_PUBLIC_API_URL` + `.env.local` Clerk keys; the API's `ClerkAuthGuard` needs `publicMetadata` (conjuntoId/unitId/role) in the session token.

> Dev seed: `npm run db:seed --workspace @nexo/database`. Smoke tests: `apps/api/dist/smoke.js` (P3), `smoke-phase4.js` (P4), `smoke-phase5.js` (P5), `smoke-phase6.js` (P6) — run with `node --env-file=../../.env`.

## Key Environment Variables Needed
```
DATABASE_URL=
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CF_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=ph-documents-prod
WOMPI_PUBLIC_KEY=
WOMPI_PRIVATE_KEY=
WOMPI_EVENTS_KEY=
WOMPI_INTEGRITY_KEY=
REDIS_URL=
APP_URL=http://localhost:3000
API_URL=http://localhost:3001
```

## Reference Docs
- `docs/blueprint.md` — Full Prisma schema, architecture diagrams, RBAC logic, R2 presigned URL flow
- `docs/execution.md` — Phase roadmap, all API endpoint specs, complete BillingService TypeScript implementation
