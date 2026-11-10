# Security & bug review — 2026-11-02

Scope: `apps/api` (all modules), `apps/web` (middleware, config, PQR pages), deps, secrets.
Method: full read of auth/tenant checks in every service, local Postgres + all smoke tests,
new `apps/api/src/smoke-security.ts` regression smoke (12 checks, all pass).

## Fixed in branch `fix/security-and-bugs`

| # | Severity | Issue | Fix |
|---|---|---|---|
| 1 | Critical | **Cross-tenant admin access.** Admin checks were `role === 'ADMIN' \|\| unitId === own` with no conjunto check. Since anyone can sign up, create a conjunto and become its ADMIN, any stranger could read any unit's balance, generate payment links, and enroll/cancel recurring payments for units of *other* conjuntos. | `auth/unit-access.ts → assertUnitAccess()` in billing + payments. |
| 2 | Critical | **Account hijack via `assign-resident`.** Upsert by Clerk id + `setPublicMetadata` let an admin re-point another tenant's admin (or anyone) to their own conjunto as RESIDENT. | Refuse if the Clerk user already belongs to another conjunto or has another role. |
| 3 | High | **Arbitrary R2 read.** Inspection `photoR2Keys` (any role, incl. residents) and PQR `attachments` were stored as given and served back as presigned GETs → any known key (admin-only docs, actas, other tenants) became readable. | Keys must sit under the inspection's / conjunto's own upload prefix. |
| 4 | High | **Wompi webhook could never verify.** Code expected an `x-wompi-signature` HMAC header that Wompi doesn't send. Wompi signs with SHA-256 over `signature.properties` values + `timestamp` + events secret ([docs](https://docs.wompi.co/en/docs/colombia/eventos/)). Every real payment would have been rejected. | `verifyWompiEvent()` implements the documented checksum; non-`transaction.updated` events are acked. |
| 5 | High | **Payment-link payments never reconciled.** Payment links don't use our `reference`; transactions carry `payment_link_id`. Auto-charge payments stored the Wompi tx id but the webhook searched by reference. | Store `link_<id>`; reconcile by tx id → link id → exact reference (no `contains`). |
| 6 | High (money) | **Paying early put residents into mora.** A pronto-pago payment (5% less) was added to `paid_amount`, leaving the charge "unpaid" by the discount, which then accrued mora on the full base. Multi-month balances were credited to one charge only. | `settleChargesForPayment()` marks every charge outstanding at payment time as fully paid. |
| 7 | High (function) | **Monthly cuotas were never generated.** `generateMonthlyCharges()` had no caller. | Cron day 1 00:10 COT, idempotent; `BILLING_CRON_ENABLED=false` to disable. |
| 8 | Medium (Habeas Data) | **Visitor logs never purged** despite `purge_after` and the 30-day promise. | Nightly purge cron 03:00 COT. |
| 9 | Medium | **Owners got 403 on their own UNIT_OWNER documents** — `occupancyType` was never written to Clerk metadata. | Written on provision/claim/assign. |
| 10 | Medium | **Resident invites could not match** — phones stored as typed, Clerk uses E.164. | `normalizePhone()` (+57 default). |
| 11 | Medium (privacy) | Iris gave residents conjunto-wide data (cartera, mora count, visitor names, all PQR titles). Comunidad gave residents every neighbour's phone. | Iris admin-only + history sanitized; phones only for ADMIN. |
| 12 | Medium | Residents could file PQRs on any unit; documents could be tagged with another tenant's unit. | Unit validated against conjunto/ownership. |
| 13 | Low | PQR photos were stored but never shown anywhere. | `attachmentUrls` (300 s presigned) + thumbnails in dashboard and portal. |
| 14 | Low | CORS allowed any `nexo-*.vercel.app` (anyone can create such a project). | Team-scoped regex + `CORS_EXTRA_ORIGINS`. |
| 15 | Low | No security headers; upload content-type unrestricted. | `helmet` on API, headers in `next.config.mjs`, image-only presigned PUTs. |
| 16 | Low | `npm audit` critical in `proxy-addr`. | `npm audit fix` (non-breaking). |

## Not fixed — needs a decision or a bigger change

- ~~No PostgreSQL RLS~~ → **done** (follow-up commit): policies on 32 tables, request queries run as `nexo_rls` with `app.conjunto_id`; `smoke-rls.ts`.
- ~~Open sign-up → instant ADMIN~~ → **done**: only `PLATFORM_ADMIN_USER_IDS` create conjuntos; residents/staff join by phone invitation (also close sign-up in the Clerk dashboard).
- ~~No invite-by-phone UI~~ → **done**: Propiedades → Invitaciones / Carga masiva.
- **Dependencies:** remaining 11 advisories need majors — Next 14 → 15/16 (critical DoS in self-hosted image optimizer; lower risk on Vercel) and NestJS 10 → 11 (body-parser/multer DoS). Plan a dedicated upgrade.
- **Wompi auto-charge** (`/v1/transactions` with `payment_source_id`) sends `customer_email: ''` and no integrity signature / acceptance token — verify against sandbox before turning on recurring payments.
- **SLA is 24/7 calendar time**, not business hours, and only the resolution SLA escalates (first-response SLA is tracked but never alerts).
- **Resident onboarding UX:** "Asignar residente" needs the resident's Clerk user id. The invite-by-phone endpoint exists but has no UI — needed before loading 300 City U residents.
- ~~No rate limiting~~ → **done** (`@nestjs/throttler`, `src/security/throttling.ts`): 600 req/min per IP + 300 req/min per Clerk user; one-time entry links 10/min per IP; `POST /pqrs` 30/min per user; `/health` and the Wompi webhook exempt; 429 in Spanish; `trust proxy` = 1 for Railway. In-memory store (single instance).
- **Secrets:** `.env` holds `ENCRYPTION_KEY`/`VOTE_SECRET` again in comment lines, and `apps/web/.clerk/.tmp/keyless.json` holds a Clerk keyless secret. The repo zip with all secrets was copied around during recovery → rotate Clerk secret, R2 keys, Neon password and Groq key. **Do not rotate `ENCRYPTION_KEY`** without re-encrypting stored cédulas.
- Mora collected is never persisted to `late_fee_amount` (only on the Payment amount) — Contabilidad reports under-report mora.
