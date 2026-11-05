# Nexo — Second Brain Export
*Generated: 2026-06-27. Paste into a new Claude instance to resume with full context.*

---

## Project Name & One-Line Description

**Nexo** — a resident-first property management SaaS built specifically for Colombian *conjuntos residenciales* (Propiedad Horizontal), the way AppFolio/Henri was built for the US but localized for Colombia: PSE/Nequi payments, coeficiente-weighted Asamblea voting, QR visitor access, and Habeas Data-compliant document storage.

---

## The Core Problem & Who It's For

**The problem:** Colombian residential community management (Propiedad Horizontal) is a fragmented, manual mess. Administrators track cuotas in Excel, residents have no self-service, payment collection relies on bank transfers with no reconciliation, Asambleas happen in person with paper ballots, and visitor access is a WhatsApp message to the guard. The existing software is either built for accounting firms (too heavy) or generic LatAm tools not built for Colombian law (Ley 675, Habeas Data Ley 1581/2012, DIAN).

**Who it's for (three personas):**
1. **Administradores** — property managers running one or more conjuntos. They need billing automation, cartera visibility, document storage, PQR management, and Asamblea tooling.
2. **Residentes / Propietarios** — apartment owners and occupants. They need to pay online (PSE/Nequi), see their balance, raise PQRs, access documents, and pre-authorize visitors from their phone.
3. **Contadores** — accountants handling the PH's books. They need CxC exports, paz y salvo certificates, DIAN-compatible data, and conciliación.

**Why Colombia specifically:** Colombian PH law (Ley 675) has specific rules around quorum, coeficiente-weighted voting, and reporting that US/generic LatAm tools don't handle. Payment rails are PSE + Nequi + Corresponsal (not cards). Phone numbers are the primary identity (not email). Habeas Data (Ley 1581) governs how resident data can be stored. Any solution has to be built natively for this context.

---

## Current Status — What's Built

The project is in **Phase 9 completed / Phase 10 (audit) complete**. The app is functionally ready — it can hold real data, all smoke tests pass, build is clean. Blocked only on config secrets before deploy.

### Built & Verified (Phases 1–9)

**Phase 1 — Foundation**
- Turborepo monorepo: `apps/api`, `apps/web`, `packages/database`, `packages/types`, `packages/utils`
- Prisma schema with 18+ models, migrations applied to Neon (PostgreSQL serverless)
- `@nexo/types` (BillingSnapshot, PresignedUrlResponse interfaces)
- `@nexo/utils` (nowInColombia, dayOfMonthCOT, daysFromDueDate, getBillingDates, applyDiscount, calculateMora, formatCOP)
- NestJS API with ClerkAuthGuard, `/health`, `/me`
- Next.js 14 web with ClerkProvider, dashboard shell

**Phase 2 — Document Vault**
- Cloudflare R2 client (presigned GET/PUT 300s TTL, putObject)
- `POST /documents/upload`, `GET /documents/:id/url`
- DocumentsGuard: 5-level visibility RBAC (ADMIN_ONLY → PUBLIC), always 403 never 404

**Phase 3 — Billing + Wompi**
- BillingService: `calculateCurrentBalance` (per-charge evaluation against billing period), `generateMonthlyCharges` (idempotent)
- Colombian billing timeline: Days 1–10 PRONTO_PAGO (discount) → Days 11–EOM TARIFA_PLENA → Day 1+ MORA
- Mora accrues on `base_amount`, not remaining balance. Daily rate = monthly_rate / 30
- Wompi webhook: returns 200 immediately → BullMQ `reconcile-wompi` → idempotency → amount verification → Prisma $transaction
- Smoke test: PASS

**Phase 4 — PQR + Inspection**
- PQR CRUD + state machine (OPEN → IN_REVIEW → RESOLVED → CLOSED) + comments + BullMQ notifications
- Inspection models: room/item capture, presigned-PUT photo flow
- Smoke test: PASS

**Phase 5 — Portería**
- Visitor QR generate/scan
- Walk-in log: Habeas Data gate (must accept Ley 1581 consent), cédula AES-256-GCM encrypted as `iv:tag:ciphertext`
- Delivery log CRUD + pickup + presigned-PUT photo
- Smoke test: PASS

**Phase 6 — Asamblea Voting**
- Create/agenda/attend (coeficiente snapshot at attendance time)
- Weighted vote: `vote_hash = SHA-256(agendaItemId + unitId + voteValue + VOTE_SECRET)`
- One-vote-per-unit-per-item enforced (400 on duplicate → intentional, tested)
- Live quorum + results tallies via Prisma `_sum` on coeficiente
- Acta PDF auto-generated with `@react-pdf/renderer` (React.createElement, NO JSX) → uploaded to R2
- Smoke test: PASS

**Phase 7 — Frontend (Admin Dashboard)**
- Navy/teal design system: `#0B1F5B` navy, `#23C7B8` teal, `#F5F6F8` bg, `#E5E7EB` border, `#FFFFFF` surface
- Typography: Poppins (400/500/600/700) via `next/font/google`
- Full Tailwind color token system in `tailwind.config.ts` (nexo-navy, nexo-teal, nexo-bg, nexo-surface, nexo-border, nexo-text, nexo-muted, nexo-faint, nexo-success, nexo-warning, nexo-error, nexo-info)
- Sidebar with CSS variable tokens for active/hover states
- NexoLogo component: SVG house-M mark (navy left stroke, teal right stroke, 2×2 grid dots), NEXO wordmark
- Pages: /dashboard (Inicio — real data), /pagos (cartera table), /solicitudes + [id], /documentos, /asambleas + [id], sidebar nav for 12 sections
- TanStack Query throughout (`useApi()` hook with Clerk JWT, no raw fetch() in components)
- `lib/api.ts`: Clerk JWT fetcher, `ApiError`, `api.upload()` for multipart
- Middleware: role-based routing (ADMIN → /dashboard, RESIDENT → /portal), conjuntoId gate → /onboarding

**Phase 8 — Onboarding + Auth Wiring**
- 2-step onboarding wizard: Conjunto creation → admin profile
- Clerk `publicMetadata`: `{ conjuntoId, unitId, role }` attached to session token
- Middleware: public routes (`/`, `/sign-in`, `/sign-up`), auth-only (`/onboarding`), auth+conjuntoId required (everything else)
- Resident invite: pending User row created by admin → resident self-signs-up via SMS OTP → auto-claimed by matching verified phone

**Phase 8 (continued) — Resident Portal**
- Completely separate consumer-facing app at `/portal/*`, mobile-first (max-w-md)
- Bottom tab bar navigation (PortalNav component)
- Pages: /portal (Inicio — balance card, quick actions, activity feed), /pagos, /solicitudes + [id], /documentos, /visitas (QR code display), /perfil, /mas
- Teal as primary CTA color, navy gradient balance card

**Phase 9 — Enhanced Features**

*9.1 Recurring Payment Intent*
- Schema: `RecurringMandate` model (unit_id, wompi_source_id, payment_method, status ACTIVE/CANCELLED/FAILED)
- `POST /payments/recurring/enroll` → calls Wompi payment_sources API → saves mandate
- `GET /payments/recurring/status`, `DELETE /payments/recurring/cancel`
- `AutoChargeProcessor` BullMQ job: idempotent (skips if AUTO_CHARGE payment already exists for unit+period)
- `BillingCronService` with `@Cron('0 6 1 * *', { timeZone: 'America/Bogota' })` — fires day 1 of each month
- Portal /pagos: "Pago automático" section — activate dialog (CARD/NEQUI), active badge + cancel

*9.2 Parking Module*
- Schema: `ParkingSpot` (spot_number, spot_type RESIDENT/VISITOR, optional unit assignment), `ParkingSession` (license_plate, visitor_name, unit_visited, entered_at, exited_at, amount_charged), `Conjunto.parking_rate_per_hour Decimal @default(3500)`
- Routes: spots list/create, sessions/entry, sessions/:id/exit (Decimal.js rate × ceil(hours), min 1h), sessions filter (spotId/date), spots/available
- /dashboard/porteria/parking: live table polling 30s, "Registrar salida", "Nueva entrada" modal
- Sidebar: "Parqueaderos" with ParkingSquare icon

*9.3 Contabilidad Lite*
- Schema: `Payment.reconciled_at DateTime?`
- `GET /contabilidad/cuentas-por-cobrar` — per-charge, phase + mora via billing engine, with unit/resident info
- `GET /contabilidad/paz-y-salvo/:unitId` — @react-pdf/renderer PDF; 400 + totalDue if unit has balance
- `POST /contabilidad/conciliacion` — CSV upload (multer), parses date/description/amount/reference rows, matches gateway_reference → sets reconciled_at, returns matched/unmatched counts
- `GET /contabilidad/reporte-mora` — totals + top 10 units by mora amount
- /dashboard/contabilidad: Cartera tab (color-coded rows green/yellow/red, CSV export), Paz y Salvo tab (unit autocomplete → download), Conciliación tab (CSV drag-drop)
- Sidebar: "Contabilidad" with BookOpen icon
- Note: CSV-only (no XLSX) — intentional YAGNI decision

*9.4 Iris AI*
- Provider: **Groq** (free tier), model: `llama-3.3-70b-versatile`, package: `groq-sdk`
- NOT Anthropic API (cost reason for now — can switch later)
- `POST /iris/chat`: gathers tenant-scoped context (last 30-day PQRs, billing recaudo %, last 5 visitor names — NO cédulas, Habeas Data), builds Spanish system prompt, multi-turn via history array, max_tokens 512
- `GET /iris/suggestions`: 4 dynamic chips based on DB state
- /dashboard/iris: full-height chat UI, suggestion chips on load, "Iris está escribiendo…" bouncing dots animation
- Sidebar: "Iris IA" with Sparkles icon

**Phase 10 Audit Results (all clean)**
- Build: 5/5, tsc clean in both apps
- Migrations: 3 in sync with Neon
- Smoke tests: all 4 PASS
- API routes: health 200, all guarded 401, none 404/500
- UI stubs: /dashboard/ayuda created (was missing from sidebar "¿Necesitas ayuda?" link)
- Fixed during audit: seed.ts delete order (FK constraint ordering)

---

## Key Decisions Locked In

### Tech Stack (non-negotiable — do not suggest alternatives)
| Layer | Choice | Why |
|---|---|---|
| Monorepo | Turborepo | Already in use |
| Backend | NestJS + TypeScript | |
| Frontend | Next.js 14 App Router + shadcn/ui + Tailwind | |
| Mobile | Expo React Native | Stubbed only — don't scaffold yet |
| ORM | Prisma | |
| Database | PostgreSQL via Neon (serverless) | |
| Storage | Cloudflare R2 (S3-compatible) | Zero egress fees |
| Auth | Clerk (SMS OTP primary) | Colombian residents often lack email |
| Payments | Wompi (PSE, Nequi, Corresponsal) | Colombian payment rails |
| Queue | BullMQ + Redis (Upstash for dev) | |
| PDF | @react-pdf/renderer (React.createElement, no JSX) | |
| AI (Iris) | Groq free tier (llama-3.3-70b-versatile) | Free for now; can switch to Anthropic later |

### Business & Pricing Model
- SaaS, per-conjunto subscription (like Sipho's pricing by unit count)
- No ads, no data selling
- Wompi transaction fees: 2.65% + $700 COP + IVA per transaction (paid by resident)
- Launch cost: ~$8/month (Railway $5 + domain $3, everything else free tier)
- 30 conjuntos: ~$104/month
- 100+ conjuntos: ~$393/month
- At scale ($1.2B COP/month volume): Wompi fees ~$9,300 USD/month in transaction revenue share potential

### Competitive Positioning vs Sipho
- **Sipho** is the main Colombian competitor (sipho.com.co, by Building Intelligence S.A.S.)
  - Uses Azure + Palomma payments (YC W23) + 5 native apps
  - Stronger on: full PUC accounting, DIAN media magnéticos, recurring debit, native intercom app
  - Pricing: $181,500–$440,000 COP/month depending on unit count (10% discount for annual)
- **Nexo advantages:**
  - Cleaner multi-tenant architecture (Neon serverless = cheaper at scale)
  - Stronger Habeas Data compliance (AES-256-GCM at app layer, not just policy)
  - Cryptographic vote integrity (SHA-256 vote hash + acta PDF)
  - Resident portal (mobile-first web, not just native app)
  - Iris AI already shipping (Sipho's is "próximamente")

### Critical Coding Rules (must follow in every session)
- **Money**: always `Decimal.js`, never JS `number`. Store as `DECIMAL(12,2)` in Postgres. Display as `$ 332.500` (es-CO locale)
- **Dates**: always `America/Bogota` via `@date-fns/tz`. Never `new Date()` in billing logic — use `nowInColombia()` from `@nexo/utils`
- **Multi-tenancy**: every DB table has `conjunto_id`. 3-layer isolation: JWT claim → NestJS Guard → PostgreSQL RLS
- **R2 keys**: format `conjuntos/{conjuntoId}/units/{unitId}/documents/{documentId}/{filename}.pdf`. Presigned URLs expire 300s — never store in DB
- **Access denial**: always 403, never 404 (404 leaks document existence)
- **Webhooks**: return 200 immediately → enqueue BullMQ → process async (Wompi 5s timeout)
- **Mora**: accrues on `base_amount` (original charge), NOT remaining balance. Daily rate = monthly_rate / 30
- **Habeas Data**: cédulas encrypted AES-256-GCM as `iv:tag:ciphertext` before DB. Visitor logs purged after 30 days
- **PDF generation**: `@react-pdf/renderer` uses `React.createElement` — NO JSX in PDF files

### Domain Glossary (use exact terms in code)
- **Conjunto** — the residential property entity (top-level tenant)
- **Unidad / Unit** — individual apartment, house, or commercial space
- **Coeficiente** — each unit's ownership share % (determines vote weight and fee share)
- **Cuota de administración** — monthly admin fee
- **Portería** — security gatehouse / guard station module
- **Asamblea** — HOA assembly / voting session
- **PQR** — Petición, Queja, Reclamo (complaint/request ticket)
- **Pronto pago** — early payment discount (days 1–10)
- **Tarifa plena** — full rate (days 11–EOM)
- **Mora** — late fees accruing daily after EOM
- **Paz y salvo** — clearance certificate showing zero balance

---

## Open Questions / Unresolved

1. **Wompi sandbox registration** — user was going to register but needed cédula + cuenta bancaria documents. Not done yet. Sandbox keys (`WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_EVENTS_KEY`, `WOMPI_INTEGRITY_KEY`, `WOMPI_RECURRING_SECRET`) all still empty.

2. **Wompi tokenized recurring** — Wompi's API supports payment source tokenization. Need to verify the exact sandbox endpoint behavior before this works end-to-end. May need to adjust the RecurringMandate enrollment flow once real keys are available.

3. **Clerk session token customization** — needs to be done in the Clerk dashboard (Sessions → Customize session token) to include `conjuntoId`, `unitId`, `role` from `publicMetadata` in the JWT. Without this, ClerkAuthGuard can't read the claims and all authenticated routes return wrong data.

4. **REDIS_URL malformed** — in `.env` the value is `REDIS_URL=REDIS_URL="rediss://..."` (key duplicated inside value). BullMQ silently falls back to localhost, so background jobs (billing cron, auto-charge, PQR notifications) will fail in production. One-line fix.

5. **R2 credentials** — CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET_NAME all empty. Document upload/view and asamblea acta PDF storage will 500 until these are set.

6. **Accounting module depth** — Nexo has "Contabilidad Lite" (CxC, paz y salvo, conciliación CSV). Sipho has full PUC accounting, DIAN media magnéticos (12 formats), NIIF states, automatic bank reconciliation. This gap matters for larger conjuntos and professional administradoras. Planned for Phase 13 but no detailed spec yet.

7. **Palomma vs Wompi** — Sipho uses Palomma (YC W23) which supports recurring debit natively + Daviplata. Wompi supports recurring via tokenization but it's more manual. No decision made on whether to eventually switch or add Palomma.

8. **Apple Developer Account** — needed for iOS App Store submission ($99/year). Not registered yet. Needed before Phase 12.

---

## Next Steps (in order)

### Immediate (before deploy)
1. **Fix REDIS_URL** — open `.env`, change `REDIS_URL=REDIS_URL="rediss://..."` to `REDIS_URL=rediss://your-url`
2. **Get GROQ_API_KEY** — free at console.groq.com, takes 2 minutes
3. **Get R2 credentials** — Cloudflare dashboard → R2 → Create bucket `ph-documents-prod` → Manage API tokens → Object Read & Write. Gets you CF_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY
4. **Configure Clerk session token** — Clerk dashboard → Sessions → Customize session token → add `publicMetadata` fields (conjuntoId, unitId, role)
5. **Deploy** — paste the deploy prompt (saved in `docs/roadmap.md`) into Claude Code:
   - API → Railway (`railway login` → `railway init` → `railway up` from apps/api)
   - Web → Vercel (`vercel --prod` from apps/web)
   - Set env vars in Railway and Vercel dashboards

### After deploy is live
6. **Get Wompi sandbox keys** — register at dashboard.wompi.co with cédula + cuenta bancaria
7. **Test full payment flow** — Wompi sandbox → PSE → reconcile-wompi BullMQ → balance update
8. **Test R2 upload** — document upload → presigned view → asamblea acta PDF

### Then (growth)
9. Onboard first real conjuntos (target: 3 within first month)
10. Iterate on bugs from real usage
11. Phase 12: Expo mobile app (see roadmap below)

---

## Roadmap (full)

*Saved at `docs/roadmap.md` in the repo*

- **Phase 9** ✅ — Recurring payments, Parking, Contabilidad Lite, Iris AI (Groq)
- **Phase 10** ✅ — Functional audit (all passing)
- **Phase 11** — Production hardening (wire Wompi, R2, Redis, Clerk token config)
- **Phase 12 — Mobile Apps (Expo React Native)**
  - Scaffold `apps/mobile` only AFTER web is stable in production (≥2 weeks live, ≥3 real conjuntos)
  - Resident-facing only: mirrors /portal but native
  - Auth: Clerk Expo SDK (SMS OTP)
  - Payments: Wompi mobile redirect (PSE → bank app, Nequi → Nequi app)
  - Builds via Expo Application Services (EAS)
  - **Google Play Store** — EAS build --platform android
  - **Apple App Store** — EAS build --platform ios (requires Apple Developer account ~$99/year)
  - Share @nexo/types, @nexo/utils from monorepo
- **Phase 13 — Growth Features**
  - Iris v2: RAG over internal documents (reglamento, actas, circulares)
  - DIAN media magnéticos export (12 formats, Res. 227/2024)
  - Full PUC accounting
  - Recurring debit with Nequi/Daviplata
  - Predictive cartera model (mora risk 30-60 days ahead)
  - Parqueaderos v2: ANPR license plate recognition
  - Multi-conjunto admin view (for professional administradoras)

---

## Names, Links, Tools & Resources

### Services (used or needed)
| Service | Purpose | URL / Notes |
|---|---|---|
| **Neon** | PostgreSQL serverless (dev + staging) | console.neon.tech — connection string already in .env |
| **Cloudflare R2** | Document/photo storage | Zero egress fees — bucket: `ph-documents-prod` |
| **Clerk** | Auth (SMS OTP primary) | clerk.com — publishable key in apps/web/.env.local |
| **Wompi** | Colombian payment gateway | dashboard.wompi.co — registration pending |
| **Upstash** | Redis (BullMQ queues) | upstash.com — free tier, REDIS_URL malformed fix needed |
| **Railway** | API hosting | railway.app — deploy target for apps/api |
| **Vercel** | Web hosting | vercel.com — deploy target for apps/web |
| **Groq** | AI inference (Iris) | console.groq.com — free tier, llama-3.3-70b-versatile |
| **Palomma** | Alt payment gateway (Sipho uses this) | YC W23 — not used but worth watching |

### Competitor
| Name | URL | Notes |
|---|---|---|
| **Sipho** | sipho.com.co | Main Colombian PH competitor, by Building Intelligence S.A.S. Uses Azure + Palomma. Strong on accounting, 5 native apps. Pricing $181k–$440k COP/month. Iris AI is "próximamente" for them — Nexo already has it. |

### Key files in the repo
| File | Purpose |
|---|---|
| `CLAUDE.md` | Persistent context for Claude Code — read this first every session |
| `docs/blueprint.md` | Full Prisma schema, architecture diagrams, RBAC logic, R2 flow, market analysis |
| `docs/execution.md` | Phase roadmap, all API specs, BillingService implementation, helper functions |
| `docs/roadmap.md` | Full product roadmap through Phase 13 + mobile plans |
| `docs/phase9-prompt.md` | Claude Code prompt used for Phase 9 (for reference) |
| `docs/phase10-audit-prompt.md` | Claude Code prompt for functional audit |
| `apps/api/src/smoke.ts` | Phase 3 smoke test (billing + Wompi) |
| `apps/api/src/smoke-phase4.ts` | Phase 4 smoke test (PQR + Inspection) |
| `apps/api/src/smoke-phase5.ts` | Phase 5 smoke test (Portería) |
| `apps/api/src/smoke-phase6.ts` | Phase 6 smoke test (Asamblea) |
| `packages/database/src/seed.ts` | Dev seed — Conjunto, Unit, User, BillingPeriod, Charge |

### Dev commands
```bash
# Start everything
npm run dev                          # from repo root (turborepo)

# Individual apps
npm run dev --workspace @nexo/api    # NestJS on port 3001
npm run dev --workspace @nexo/web    # Next.js on port 3000

# Database
npm run db:seed --workspace @nexo/database
cd packages/database && npx prisma migrate dev --name <name>
cd packages/database && npx prisma studio

# Build
npm run build                        # from root (all 5 packages)
cd apps/api && npx tsc --noEmit

# Smoke tests (from apps/api, after npm run build)
node --env-file=../../.env dist/smoke.js
node --env-file=../../.env dist/smoke-phase4.js
node --env-file=../../.env dist/smoke-phase5.js
node --env-file=../../.env dist/smoke-phase6.js
```

---

## Jose's Vision & Thinking

- The idea came from seeing the pain firsthand — Colombian conjuntos are managed with chaos, WhatsApp messages, and Excel. The existing tools either don't exist or were built by accounting software companies who bolted on a mobile app.
- The name **Nexo** is intentional — it means "connection/link" in Spanish, nodding to the idea of connecting residents, administration, and the physical space.
- The vision is **resident-first**, not admin-first. Most PH software is built for the administrator. Nexo's portal (`/portal/*`) is built for the person who actually lives there — pay from your phone, raise a complaint, see your documents, pre-authorize your visitor — without calling anyone.
- Short term: get to production, onboard real conjuntos, charge real money. Validate the market before over-engineering.
- Medium term: mobile apps (Google Play + App Store) once web is stable. This is when residents start to really engage daily rather than just monthly for payments.
- Long term: Iris AI becoming the "digital administrator" — not just a chatbot, but an assistant that knows the conjunto's reglamento, can answer "am I in mora?", can draft a circular, can flag that apartment 302 has been late 3 months in a row.
- On Groq vs Anthropic for Iris: chose Groq free tier to get it shipped. The plan is to swap to a better model (possibly Anthropic Claude) once there's revenue to justify the API cost.
- On Wompi vs Palomma: went with Wompi because it's more established in Colombia and easier to register for. Palomma (Sipho's choice) has recurring debit natively but requires YC-style onboarding. Not a final decision.
- Jose noted that Sipho is doing well but has gaps in AI and mobile-first UX. The goal is to out-execute them on those two dimensions and price competitively for small-to-medium conjuntos (50–300 units) which is underserved.

---

## Environment Variables Checklist

```
# SET ✅
DATABASE_URL=                      # Neon connection string — set
CLERK_SECRET_KEY=                  # set
CLERK_PUBLISHABLE_KEY=             # set
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY= # set (in apps/web/.env.local)

# MISSING / NEEDS FIX ❌
CF_ACCOUNT_ID=                     # Cloudflare account ID
R2_ACCESS_KEY_ID=                  # Cloudflare R2 API token
R2_SECRET_ACCESS_KEY=              # Cloudflare R2 API secret
R2_BUCKET_NAME=ph-documents-prod   # R2 bucket name
WOMPI_PUBLIC_KEY=                  # Wompi sandbox public key
WOMPI_PRIVATE_KEY=                 # Wompi sandbox private key
WOMPI_EVENTS_KEY=                  # Wompi webhook events key
WOMPI_INTEGRITY_KEY=               # Wompi integrity key
WOMPI_RECURRING_SECRET=            # Wompi recurring payment secret
GROQ_API_KEY=                      # Groq API key (free tier)
API_URL=http://localhost:3001       # set for local; update to Railway URL on deploy
NEXT_PUBLIC_API_URL=http://localhost:3001  # same — update to Railway URL

# MALFORMED ⚠️
REDIS_URL=                         # Currently: REDIS_URL="rediss://..." (key duplicated in value)
                                   # Fix: REDIS_URL=rediss://your-upstash-url

# OPTIONAL (add when needed)
ENCRYPTION_KEY=                    # AES-256 key for cédula encryption (32 bytes hex)
VOTE_SECRET=                       # Secret for vote hash integrity
```
