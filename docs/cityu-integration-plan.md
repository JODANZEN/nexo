# Nexo × City U — Integration & Build Plan

> Source: Fable research (2026-07). Client = Colombian student-residence operator.
> Pilot **Cali (300 rooms / 2 types)** → **City U (1,500 / 14 types)**, separate account per building.
> #1 pain = **ticket response time + resolution**; root cause = **resident reachability**.
> Strategy: own the resident-response loop; integrate HubSpot + Siigo + DocuSign; replace Nuvola's resident-ops.

## Notifications stack (the reachability fix)
- **WhatsApp = primary channel** (near-universal with Colombian students, cheapest — Meta CO utility msgs ~$0.0008). **SMS = fallback** (Twilio ~$0.05/msg, or local Hablame/LabsMobile 5–10× cheaper but weaker). **Email = Resend** (great TS DX, React Email, 3k free/mo). **In-app feed = always-on free channel.**
- **Recommended: Twilio (WhatsApp + SMS) + Resend (email) + in-app.** Migrate WhatsApp to Meta Cloud API direct later if volume justifies.
- ⏰ **START NOW (lead time):** Meta Business verification + pre-approved WhatsApp **utility templates** ("ticket actualizado", "visitante llegó", "cuota por vencer"). This gates the whole channel and takes days–weeks.
- **NestJS wiring:** one `NotificationsModule` — channel-agnostic `notify(userId, event, payload)` → persist a `Notification` row → enqueue per-channel BullMQ jobs (`notifications:whatsapp|email|sms`, separate queues + per-queue rate limits) → each processor implements a common `ChannelProvider` (Twilio/Resend adapters). Add per-user channel prefs + verified phone, delivery-status webhooks, and a **fallback cascade** (WhatsApp → wait N min undelivered → SMS/email via BullMQ delayed jobs). Replaces the console stub with zero caller changes.

## Ticketing upgrades (PQR module) — attacks the #1 pain
Add to the Pqr model:
- `priority` (P1–P4) from an **impact × urgency** matrix, staff-overridable.
- `slaPolicy` → derived `firstResponseDueAt` / `resolutionDueAt` (business-hours aware) + `firstRespondedAt` / `resolvedAt` / `slaBreached`. Track first-response **and** resolution separately.
- **`awaiting-resident` status that PAUSES the SLA clock** + auto-nudges the resident on WhatsApp at 24h/48h. ← directly fixes reachability.
- `escalationLevel` + log — BullMQ delayed jobs at **70% → nudge assignee, 90% → notify supervisor, 100% → breach/escalate**.
- `routingRule` — auto-assign by category × building/zone (maintenance / admin / portería queues), round-robin within team.
- **Taxonomy** (client ask): scope = `IN_UNIT` / `FACILITY` / `INTERNAL_OPS`.
- Metrics: FRT, MTTR, breach %, reopen rate — per category & assignee.
- Study (don't adopt) schemas: **Zammad** (SLA/escalation engine), **osTicket** (SLA plans + business hours), **FreeScout**.

## Integrations (Phase 19 — gate behind PREMIUM entitlement)
| Tool | Auth | Key calls | Sandbox | Effort | v1 approach |
|---|---|---|---|---|---|
| **HubSpot** (CRM) | Private App token (static) | `POST/PATCH /crm/v3/objects/contacts`; units as custom object (Enterprise) or Company/Deal; associations | Free dev accounts | **S–M** | one-way Nexo→HubSpot resident/lease upserts (BullMQ); webhook reverse-sync only for sales-edited fields |
| **DocuSign** (e-sign) | **JWT Grant** (service user, RSA key, one-time consent) | `POST /v2.1/accounts/{id}/envelopes` (templateId + tabs); `/views/recipient` (embedded signing); Connect webhooks | Free dev; **go-live review (20+ calls)** | **M** | lease templates + embedded signing in resident app; entry-auth via email-remote (guardians lack app) |
| **Siigo** (accounting) | `POST /auth` → JWT (24h) + **`Partner-Id` header** | `POST /v1/customers` (terceros), `POST /v1/invoices` (cartera→DIAN), `POST /v1/vouchers` (payments/AR) | Yes; **10 req/min test, 100/min prod** | **M** | one-way push cartera→Siigo via rate-limited BullMQ queue; cache token in Redis; fetch per-company catalog IDs, don't hardcode |

## Replacing Nuvola (Phase 18 build list)
Staff mobile task views w/ room status · preventive-maintenance (recurring auto-tickets per asset/room) · inspection checklists per room type (Inspecciones already exists — extend) · SLA/escalation engine (Phase 17) · housekeeping-style board by floor/room · semester-lifecycle workflows (move-in waves) not nightly turnover.

## Build order
1. **Phase 17 — fast-ticket loop + notifications** (no external approval risk): NotificationsModule (Resend + in-app first; Twilio WhatsApp in parallel while Meta approves templates) → PQR priority/SLA/awaiting-resident → escalation engine → SLA dashboard.
2. **Phase 18 — room-types + traceability**: RoomType catalog + per-type inspection checklists + unit status board + preventive maintenance + full ticket audit timeline + staff task view.
3. **Phase 19 — integrations** (by effort/lead-time): HubSpot (S) → DocuSign (M) → Siigo (M). Start Meta + DocuSign approvals week 1 even though code ships last.

## Discovery questions for City U
1. **Siigo:** plan/edition? existing API creds (alianzas partner)? one company or separate for Cali? which document types / payment methods / cost centers map to charges? DIAN e-invoicing already in Siigo?
2. **HubSpot:** tier (Enterprise → custom objects)? what does sales store per lead — need unit availability, or just resident lifecycle?
3. **DocuSign:** account plan + volume? signers on a lease (student + guardian, sequential)? do "entry authorizations" legally need DocuSign or is an in-app consent log enough?
4. **WhatsApp:** existing Business number / Meta verification? who owns it? current WhatsApp-group habits residents expect?
5. **SLAs:** actual target response/resolution times per category? maintenance-team business hours? escalation chain (supervisor → ops manager)?
6. **Nuvola:** contract end/termination? which modules in use (data to migrate: open work orders, PM schedules, checklists)?
7. **Cali:** same staff/processes or separate tenant/config?
