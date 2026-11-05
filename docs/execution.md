# Colombian PropTech SaaS — Execution Plan & Billing Engine

> **Stack:** Next.js · NestJS · Prisma · PostgreSQL · Cloudflare R2 · Wompi
> **Focus:** Document Vault · Billing Engine · PQR & Move-in Inspection

---

## Part 1: Execution Roadmap

### Phase Overview

```
Phase 1 (Weeks 1–2): Foundation
  └─ Monorepo scaffold, auth, DB, shared types

Phase 2 (Weeks 3–4): Document Vault
  └─ R2 integration, presigned URLs, RBAC

Phase 3 (Weeks 5–7): Billing Engine + Wompi
  └─ Charge generation, payment links, webhooks, reconciliation

Phase 4 (Weeks 8–10): PQR + Move-in Inspection
  └─ Ticket system, inspection flow, photo uploads
```

---

### Phase 1 — Foundation (Weeks 1–2)

**Goal:** Every subsequent phase builds on this. Nothing ships from Phase 2 onward if auth, DB, or the monorepo structure is shaky.

#### Step 1.1 — Monorepo Scaffold

Use **Turborepo** to manage the workspace:

```
apps/
  api/          ← NestJS backend
  web/          ← Next.js admin console
  mobile/       ← Expo React Native app (stub for now)
packages/
  database/     ← Prisma schema + generated client (shared)
  types/        ← Shared TypeScript interfaces/DTOs
  utils/        ← Colombian date helpers, COP formatters
```

```bash
npx create-turbo@latest
# Then scaffold NestJS inside apps/api:
cd apps/api && npx @nestjs/cli new . --skip-git
```

The `packages/database` package exports the Prisma client so both `apps/api` and future scripts share one schema instance. Never have two Prisma schemas.

#### Step 1.2 — Database & Prisma Setup

```bash
# In packages/database
npm install prisma @prisma/client
npx prisma init

# Copy schema from blueprint document
# Run first migration
npx prisma migrate dev --name init
npx prisma generate
```

Set up **Neon** (serverless Postgres) for dev + staging, **AWS RDS** for production. Add to `packages/database/package.json`:

```json
{
  "scripts": {
    "db:migrate": "prisma migrate deploy",
    "db:seed": "ts-node seed.ts",
    "db:studio": "prisma studio"
  }
}
```

#### Step 1.3 — Authentication (Clerk)

Clerk is the fastest path to SMS OTP (critical for Colombian residents without email). Install in both `apps/api` and `apps/web`:

```bash
npm install @clerk/nextjs          # in apps/web
npm install @clerk/clerk-sdk-node  # in apps/api
```

**JWT Strategy in NestJS:** Clerk issues a JWT with your custom claims. Create a `ClerkAuthGuard` that:
1. Extracts the Bearer token from the `Authorization` header
2. Verifies with Clerk's JWKS endpoint
3. Attaches `{ userId, conjuntoId, unitId, role }` to `req.user`

```typescript
// apps/api/src/auth/clerk.strategy.ts
@Injectable()
export class ClerkAuthGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const token = extractBearerToken(request);
    const payload = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY,
    });
    // Clerk publicMetadata holds conjuntoId, unitId, role
    request.user = {
      userId: payload.sub,
      conjuntoId: payload.publicMetadata.conjuntoId,
      unitId: payload.publicMetadata.unitId,
      role: payload.publicMetadata.role,
    };
    return true;
  }
}
```

**Set custom metadata on Clerk users** via your admin onboarding flow (when an Admin registers a resident, call Clerk's Backend API to set `publicMetadata`).

#### Step 1.4 — Shared Types Package

In `packages/types`, define DTOs that both API and frontend use:

```typescript
// packages/types/src/billing.ts
export interface BillingSnapshot {
  unitId: string;
  unitNumber: string;
  billingPeriodId: string;
  periodLabel: string;
  baseAmount: number;       // COP, in centavos internally, displayed in pesos
  discountAmount: number;
  lateFeesAmount: number;
  totalDue: number;
  billingPhase: 'PRONTO_PAGO' | 'TARIFA_PLENA' | 'MORA';
  daysFromDueDate: number;
  dueDate: string;           // ISO string
  discountDeadline: string;
  prontoPagoRate: number;    // 0.05 = 5%
  moraRate: number;          // Monthly rate, e.g., 0.015 = 1.5%
  outstandingChargeIds: string[];
}

// packages/types/src/document.ts
export interface PresignedUrlResponse {
  url: string;         // Expires in 300 seconds
  expiresAt: string;   // ISO string
  documentId: string;
  title: string;
}
```

**Deliverable to exit Phase 1:** `GET /api/health` returns `{ status: 'ok', db: 'connected' }`. Auth guard protects a test route. Prisma migrations run cleanly on Neon.

---

### Phase 2 — Document Vault (Weeks 3–4)

**Goal:** Admins can upload PDFs. Residents can request and view their own documents via time-limited URLs. No public links ever exist.

#### Step 2.1 — Cloudflare R2 Bucket Setup

```bash
# In Cloudflare dashboard:
# 1. Create bucket: "ph-documents-prod"
# 2. Create R2 API Token with Object Read & Write on that bucket
# 3. Note: Account ID, Access Key ID, Secret Access Key
```

Because R2 is S3-compatible, use the AWS SDK v3 with a custom endpoint:

```typescript
// packages/database/src/r2.ts (shared client)
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

export const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.CF_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY!,
  },
});

export async function generatePresignedGetUrl(r2Key: string, expiresInSeconds = 300): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: process.env.R2_BUCKET_NAME!,
    Key: r2Key,
    ResponseContentDisposition: 'inline', // Render in browser, not download
    ResponseContentType: 'application/pdf',
  });
  return getSignedUrl(r2, command, { expiresIn: expiresInSeconds });
}
```

#### Step 2.2 — Upload Flow (Admin Side)

Admin uploads go through the API, never directly from the browser to R2 (avoids exposing R2 credentials):

```
Admin Browser
    │  POST /api/documents/upload (multipart/form-data)
    ▼
NestJS (validates, streams file)
    │  PutObject to R2
    ▼
Cloudflare R2
    │  Returns ETag
    ▼
NestJS creates Document record in DB (stores r2_key, never the URL)
    │  Returns { documentId, title } to admin
    ▼
Admin Browser (shows document in list)
```

Use `@nestjs/platform-express` with `multer` and `MulterModule` — do NOT store temp files to disk, use `memoryStorage()` and stream directly to R2.

#### Step 2.3 — Presigned URL Flow (Resident Side)

See Part 2: API Route Blueprint for the endpoint spec.

**Key implementation detail:** The presigned URL is never stored in your DB. It is generated on every request, is unique, and expires in 300 seconds. If a resident shares the URL, it expires before most people would even open it.

#### Step 2.4 — RBAC Middleware

Create a `DocumentsGuard` (separate from `ClerkAuthGuard`) that runs after auth:

```typescript
// Pipe: ClerkAuthGuard → DocumentsGuard → Controller
// DocumentsGuard fetches the doc from DB, calls canAccessDocument(), throws 403 if denied.
// Never return a 404 for access denials — always 403. 404 leaks existence of the document.
```

**Deliverable to exit Phase 2:** Postman test — upload a PDF as Admin, request presigned URL as the same unit's Resident (succeeds), request as a different unit's Resident (403).

---

### Phase 3 — Billing Engine + Wompi (Weeks 5–7)

**Goal:** Admins run monthly billing. Residents see exactly what they owe today. Payment links work for PSE, Nequi, and Corresponsal. Webhooks reconcile automatically.

#### Step 3.1 — Billing Period Generation (Admin Cron)

Every month (1st of the month, midnight COT = UTC-5), a BullMQ job:
1. Creates a new `BillingPeriod` record
2. For each `Unit` in the `Conjunto`, creates a `Charge` record (base = unit.monthly_fee)
3. Sends a push notification + email to all residents with a payment link

```typescript
// Cron: '0 5 1 * *' (midnight COT = 05:00 UTC)
@Cron('0 5 1 * *')
async generateMonthlyBilling(): Promise<void> {
  const conjuntos = await this.prisma.conjunto.findMany({ where: { is_active: true } });
  for (const conjunto of conjuntos) {
    await this.billingQueue.add('generate-charges', { conjuntoId: conjunto.id });
  }
}
```

#### Step 3.2 — Billing Engine Logic

See Part 3 for the full `calculateCurrentBalance()` implementation.

#### Step 3.3 — Wompi Integration

Wompi Colombia has two APIs you need:

**Payment Links API** (`POST https://api.wompi.co/v1/payment_links`) — Creates a hosted payment page for PSE/Nequi/Corresponsal.

**Webhooks** — Wompi POSTs to your endpoint on transaction events (`transaction.updated`).

```bash
# Install Wompi SDK (there's no official Node SDK — use raw fetch/axios)
npm install axios
```

#### Step 3.4 — Testing Wompi Webhooks Locally

Wompi requires a public HTTPS URL for webhooks. Use **ngrok** during development:

```bash
# Terminal 1: Run NestJS
npm run start:dev   # Runs on http://localhost:3000

# Terminal 2: Expose via ngrok
ngrok http 3000
# Outputs: https://abc123.ngrok-free.app

# In Wompi Dashboard > Developers > Webhooks:
# Set URL to: https://abc123.ngrok-free.app/api/payments/wompi/webhook
# Set events: transaction.updated
# Save — Wompi will show the webhook secret (events key)
```

**Simulate a webhook locally without ngrok:**

```bash
# Use Wompi's test environment (sandbox.wompi.co) with test API keys
# Trigger a test transaction in Wompi sandbox dashboard
# Or POST manually to your local endpoint:

curl -X POST http://localhost:3000/api/payments/wompi/webhook \
  -H "Content-Type: application/json" \
  -H "x-wompi-signature: sha256=<computed_hmac>" \
  -d '{
    "event": "transaction.updated",
    "data": {
      "transaction": {
        "id": "test-txn-001",
        "reference": "charge_abc123_1234567890",
        "status": "APPROVED",
        "amount_in_cents": 35000000,
        "currency": "COP"
      }
    }
  }'
```

**Webhook signature verification** (critical — reject any unsigned webhook):

```typescript
import * as crypto from 'crypto';

function verifyWompiSignature(payload: string, receivedSig: string, secret: string): boolean {
  const computed = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(`sha256=${computed}`),
    Buffer.from(receivedSig)
  );
}
```

**Deliverable to exit Phase 3:** End-to-end test — call `calculateCurrentBalance('unit_id')`, generate a Wompi link, simulate a webhook `APPROVED`, verify the DB shows `Payment.status = PAID` and `Charge.paid_amount` updated.

---

### Phase 4 — PQR + Move-in Inspection (Weeks 8–10)

**Goal:** Residents submit PQRs. Move-in Inspection flow captures room-by-room condition with photos stored in R2.

#### Step 4.1 — PQR Module

Standard CRUD with a state machine: `OPEN → IN_REVIEW → RESOLVED → CLOSED`. Use BullMQ to send push notifications on status transitions. Add SLA tracking: if a PQR stays `IN_REVIEW` for more than N days (configured per conjunto), escalate to Admin automatically.

#### Step 4.2 — Move-in Inspection Flow

The inspection is a guided multi-step form. Schema additions needed (not in original blueprint):

```prisma
model Inspection {
  id              String            @id @default(cuid())
  conjunto_id     String
  unit_id         String
  occupancy_id    String            // Tied to the UnitOccupancy it covers
  inspector_id    String            // User (resident or admin)
  type            InspectionType    // MOVE_IN | MOVE_OUT | ROUTINE
  status          InspectionStatus  // DRAFT | SUBMITTED | ADMIN_REVIEWED
  submitted_at    DateTime?
  created_at      DateTime          @default(now())

  unit            Unit              @relation(...)
  occupancy       UnitOccupancy     @relation(...)
  rooms           InspectionRoom[]
}

model InspectionRoom {
  id              String            @id @default(cuid())
  inspection_id   String
  room_name       String            // "Sala", "Cocina", "Habitación Principal"
  overall_rating  Int               // 1–5
  notes           String?
  photo_r2_keys   String[]          // Array of R2 object keys

  inspection      Inspection        @relation(...)
  items           InspectionItem[]
}

model InspectionItem {
  id              String   @id @default(cuid())
  room_id         String
  item_name       String   // "Paredes", "Piso", "Ventanas", "Interruptor"
  condition       String   // "BUENO" | "REGULAR" | "MALO" | "NO_APLICA"
  notes           String?

  room            InspectionRoom @relation(...)
}
```

**Photo upload for inspections** uses the same R2 pattern as documents — resident requests a presigned PUT URL from the API, uploads directly to R2 from the mobile app, then POSTs the R2 key back to your API. Never route binary files through NestJS in production.

**Deliverable to exit Phase 4:** Resident can complete a move-in inspection on mobile: rate 5 rooms, upload 3 photos per room, submit. Admin sees the submitted inspection with all photos rendering via presigned URLs.

---

## Part 2: API Route Blueprint

All routes are prefixed with `/api`. All require `Authorization: Bearer <clerk_jwt>` unless marked `[PUBLIC]`.

---

### 2.1 — Billing Endpoints

#### Generate current balance for a unit

```
GET /api/billing/units/:unitId/balance

Response 200:
{
  "unitId": "ut_01HXZ",
  "unitNumber": "301",
  "periodLabel": "Junio 2025",
  "baseAmount": 350000,
  "discountAmount": -17500,       // 5% pronto pago
  "lateFeesAmount": 0,
  "totalDue": 332500,
  "billingPhase": "PRONTO_PAGO",
  "daysFromDueDate": -5,          // 5 days before due date
  "dueDate": "2025-06-10T00:00:00.000Z",
  "discountDeadline": "2025-06-10T23:59:59.000Z",
  "prontoPagoRate": 0.05,
  "moraRate": 0.015,
  "outstandingChargeIds": ["ch_abc", "ch_def"]
}
```

Guards: `ClerkAuthGuard` → user.unitId must equal `:unitId` OR user.role is ADMIN.

---

#### Generate a Wompi payment link

```
POST /api/payments/links/generate

Request body:
{
  "unitId": "ut_01HXZ",
  "chargeIds": ["ch_abc", "ch_def"],  // from outstandingChargeIds above
  "paymentMethod": "PSE" | "NEQUI" | "CORRESPONSAL"
}

Response 200:
{
  "paymentLinkUrl": "https://checkout.wompi.co/l/abc123",
  "wompiLinkId": "pl_xyz",
  "amountInCents": 33250000,          // totalDue × 100
  "expiresAt": "2025-06-08T23:59:59Z",
  "reference": "charge_ut01HXZ_1749340800"  // for reconciliation
}
```

**Internal logic:**
1. Call `calculateCurrentBalance(unitId)` to get `totalDue` at this exact moment.
2. Build the Wompi payload:
   ```typescript
   {
     name: `Cuota Administración ${periodLabel} - Apto ${unitNumber}`,
     description: `${billingPhase === 'PRONTO_PAGO' ? '✅ Descuento pronto pago aplicado' : ''}`,
     single_use: true,
     collect_shipping: false,
     currency: 'COP',
     amount_in_cents: Math.round(totalDue * 100),
     redirect_url: `${process.env.APP_URL}/pagos/confirmacion`,
     customer_data: { ... },
     // reference encodes unitId + timestamp for webhook reconciliation
     payment_methods: [
       { type: 'PSE' },
       { type: 'NEQUI' },
       { type: 'BANCOLOMBIA_TRANSFER' },  // Corresponsal
       { type: 'EFECTY' },
     ],
   }
   ```
3. POST to `https://api.wompi.co/v1/payment_links` with `Authorization: Bearer ${WOMPI_PRIVATE_KEY}`.
4. Store the `wompiLinkId` + `reference` in a pending `Payment` record.
5. Return the checkout URL.

---

#### Wompi Webhook Listener

```
POST /api/payments/wompi/webhook  [PUBLIC — no auth, but signature-verified]

Headers:
  x-wompi-signature: sha256=<hmac_sha256_of_body>

Request body (Wompi sends this):
{
  "event": "transaction.updated",
  "data": {
    "transaction": {
      "id": "txn_wompi_001",
      "reference": "charge_ut01HXZ_1749340800",
      "status": "APPROVED",           // APPROVED | DECLINED | VOIDED | ERROR
      "amount_in_cents": 33250000,
      "currency": "COP",
      "payment_method_type": "PSE",
      "created_at": "2025-06-03T20:15:00Z"
    }
  },
  "sent_at": "2025-06-03T20:15:01Z"
}

Response 200: { "received": true }
Response 400: (invalid signature — Wompi will retry)
```

**Internal reconciliation logic (runs in a BullMQ job, NOT synchronously in the webhook handler):**

```typescript
// Webhook handler — fast, idempotent, returns 200 immediately
@Post('wompi/webhook')
async handleWompiWebhook(@Req() req: RawBodyRequest, @Headers() headers) {
  const sig = headers['x-wompi-signature'];
  if (!this.verifyWompiSignature(req.rawBody, sig)) {
    throw new BadRequestException('Invalid signature');
  }
  // Enqueue — never process inline (Wompi has a 5s timeout)
  await this.paymentsQueue.add('reconcile-wompi', req.body, {
    attempts: 5,
    backoff: { type: 'exponential', delay: 2000 },
  });
  return { received: true };
}

// BullMQ processor — the real work
@Process('reconcile-wompi')
async reconcileWompiPayment(job: Job) {
  const { transaction } = job.data.data;
  const { reference, status, amount_in_cents, id: gatewayRef } = transaction;

  // 1. Idempotency: skip if already processed
  const existing = await this.prisma.payment.findUnique({
    where: { gateway_reference: gatewayRef },
  });
  if (existing?.status === 'PAID') return;

  // 2. Find the pending Payment by reference
  const payment = await this.prisma.payment.findFirst({
    where: { gateway_reference: { contains: reference } },
    include: { charge: true },
  });
  if (!payment) throw new Error(`Payment not found for reference: ${reference}`);

  // 3. Verify amount matches (prevent partial payment attacks)
  const expectedCents = Math.round(Number(payment.amount) * 100);
  if (amount_in_cents !== expectedCents) {
    await this.alertAdminOfMismatch(payment, amount_in_cents);
    return;
  }

  // 4. Update Payment + Charge atomically
  await this.prisma.$transaction([
    this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        status: status === 'APPROVED' ? 'PAID' : 'FAILED',
        gateway_reference: gatewayRef,
        paid_at: status === 'APPROVED' ? new Date() : null,
        gateway_payload: transaction,
      },
    }),
    ...(status === 'APPROVED' && payment.charge_id ? [
      this.prisma.charge.update({
        where: { id: payment.charge_id },
        data: { paid_amount: { increment: payment.amount } },
      }),
    ] : []),
  ]);

  // 5. Notify resident
  if (status === 'APPROVED') {
    await this.notificationsService.sendPush(payment.unit_id, {
      title: '✅ Pago recibido',
      body: `Tu pago de ${formatCOP(payment.amount)} fue aprobado.`,
    });
    await this.documentsService.generateAndStoreReceipt(payment.id);
  }
}
```

---

### 2.2 — Document Vault Endpoints

#### Request presigned URL for a document

```
GET /api/documents/:documentId/url

Response 200:
{
  "url": "https://pub-abc.r2.dev/conjuntos/cj_01/units/ut_42/docs/doc_88/lease.pdf?X-Amz-Expires=300&X-Amz-Signature=...",
  "expiresAt": "2025-06-03T20:25:01Z",
  "documentId": "doc_88",
  "title": "Contrato de Arrendamiento 2025"
}

Error 403:
{ "error": "FORBIDDEN", "message": "Access denied" }
```

Guards: `ClerkAuthGuard` → `DocumentsGuard` (checks tenant isolation + visibility RBAC).

---

#### Upload a document (Admin)

```
POST /api/documents/upload
Content-Type: multipart/form-data

Form fields:
  file:         <PDF binary>
  title:        "Contrato Arrendamiento Apto 301"
  unitId:       "ut_01HXZ"            (optional — null for conjunto-wide docs)
  visibility:   "UNIT_OCCUPANT"
  containsPii:  true

Response 201:
{
  "documentId": "doc_abc123",
  "title": "Contrato Arrendamiento Apto 301",
  "r2Key": "[REDACTED — never returned to client]",
  "createdAt": "2025-06-03T20:00:00Z"
}
```

---

#### List documents accessible to the current user

```
GET /api/documents?unitId=ut_01HXZ

Response 200:
{
  "data": [
    {
      "documentId": "doc_abc",
      "title": "Contrato Arrendamiento 2025",
      "visibility": "UNIT_OCCUPANT",
      "fileSizeBytes": 204800,
      "createdAt": "2025-01-15T10:00:00Z"
    }
  ],
  "total": 1
}
```

Note: The query filters by `canAccessDocument()` at the DB query level (not post-fetch). Never fetch a document and then decide to hide it — filter at `WHERE` clause.

---

### 2.3 — PQR Endpoints

```
POST   /api/pqrs                          Create new PQR
GET    /api/pqrs?status=OPEN&unitId=...   List PQRs (filtered by role)
GET    /api/pqrs/:pqrId                   Get single PQR + comments
PATCH  /api/pqrs/:pqrId/status            Admin: transition status
POST   /api/pqrs/:pqrId/comments          Add comment (internal flag for admin-only)
POST   /api/inspections                   Create move-in inspection (DRAFT)
PATCH  /api/inspections/:id/rooms/:roomId Update room rating + notes
POST   /api/inspections/:id/rooms/:roomId/photos/presign  Get presigned PUT URL for photo upload
POST   /api/inspections/:id/submit        Finalize and submit inspection
```

---

## Part 3: The Billing Engine — Full Implementation

### File Structure

```
apps/api/src/billing/
  billing.module.ts
  billing.service.ts        ← calculateCurrentBalance() lives here
  billing.controller.ts
  billing.scheduler.ts      ← Monthly charge generation cron
  dto/
    billing-snapshot.dto.ts
    generate-payment-link.dto.ts
  helpers/
    colombia-dates.ts       ← COT timezone helpers
    cop-math.ts             ← Decimal arithmetic helpers
```

---

### `colombia-dates.ts` — Timezone Helper

Colombia does not observe daylight saving time. COT is always UTC-5. This matters for billing: "day 1 of the month" must be midnight in Bogotá, not midnight UTC.

```typescript
// apps/api/src/billing/helpers/colombia-dates.ts
import { TZDate } from '@date-fns/tz';
import { differenceInDays, startOfDay, endOfDay } from 'date-fns';

export const COT_TIMEZONE = 'America/Bogota'; // UTC-5, no DST

/**
 * Returns the current date/time in Colombian time (COT).
 * All billing calculations must use this — never `new Date()` directly.
 */
export function nowInColombia(): Date {
  return new TZDate(new Date(), COT_TIMEZONE);
}

/**
 * Returns day-of-month in Colombian time (1–31).
 */
export function dayOfMonthCOT(date: Date = new Date()): number {
  return new TZDate(date, COT_TIMEZONE).getDate();
}

/**
 * Calculates how many calendar days have passed since the due date.
 * Positive = days PAST due (mora territory).
 * Negative = days BEFORE due (still within grace period).
 */
export function daysFromDueDate(dueDate: Date): number {
  const todayCOT = startOfDay(new TZDate(new Date(), COT_TIMEZONE));
  const dueDateCOT = startOfDay(new TZDate(dueDate, COT_TIMEZONE));
  return differenceInDays(todayCOT, dueDateCOT);
}

/**
 * Given a billing period month/year, returns the pronto pago deadline.
 * Colombian convention: pronto pago window = days 1–10 of the billing month.
 * Due date = day 10. After that, tarifa plena. After day 30/EOM, mora starts.
 */
export function getBillingDates(
  periodMonth: number, // 1–12
  periodYear: number,
): {
  billingStart: Date;   // Day 1 of month
  prontoPagoDeadline: Date; // Day 10, 23:59:59 COT
  tarifaPlenaDeadline: Date; // Last day of month, 23:59:59 COT
  moraStartDate: Date;  // Day 1 of next month
} {
  // Day 1 midnight COT
  const billingStart = new TZDate(
    new Date(periodYear, periodMonth - 1, 1, 0, 0, 0),
    COT_TIMEZONE,
  );

  // Day 10 end of day COT
  const prontoPagoDeadline = new TZDate(
    new Date(periodYear, periodMonth - 1, 10, 23, 59, 59),
    COT_TIMEZONE,
  );

  // Last day of month end of day COT
  const lastDay = new Date(periodYear, periodMonth, 0).getDate(); // 0th day of next month = last day of this month
  const tarifaPlenaDeadline = new TZDate(
    new Date(periodYear, periodMonth - 1, lastDay, 23, 59, 59),
    COT_TIMEZONE,
  );

  // Day 1 of next month midnight COT
  const moraStartDate = new TZDate(
    new Date(periodYear, periodMonth, 1, 0, 0, 0),
    COT_TIMEZONE,
  );

  return { billingStart, prontoPagoDeadline, tarifaPlenaDeadline, moraStartDate };
}
```

---

### `cop-math.ts` — Safe COP Arithmetic

Never use JavaScript `number` for COP amounts. The Prisma schema uses `Decimal` (maps to PostgreSQL `DECIMAL`). Use `Decimal.js` for all math.

```typescript
// apps/api/src/billing/helpers/cop-math.ts
import Decimal from 'decimal.js';

// Configure Decimal.js for COP: no scientific notation, round half up (banker's standard)
Decimal.set({ precision: 20, rounding: Decimal.ROUND_HALF_UP });

/**
 * Apply a discount rate to a base amount.
 * Returns the discount amount (positive), not the discounted total.
 *
 * @example applyDiscount(350000, 0.05) → 17500
 */
export function applyDiscount(baseAmount: Decimal, rate: Decimal): Decimal {
  return baseAmount.mul(rate).toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Calculate Colombian daily mora (late fee).
 *
 * Colombia's Ley 675 allows conjuntos to set their own mora rate in the reglamento.
 * The rate stored in BillingPeriod.late_fee_rate is the MONTHLY rate.
 * Daily rate = monthly rate / 30 (Colombian convention, not actual days in month).
 *
 * @param baseAmount  The original unpaid charge (no discounts — mora accrues on full base)
 * @param monthlyRate Monthly mora rate (e.g., 0.015 = 1.5%)
 * @param daysLate    Number of calendar days past the due date (must be > 0)
 * @returns           Total accumulated mora amount in COP
 */
export function calculateMora(
  baseAmount: Decimal,
  monthlyRate: Decimal,
  daysLate: number,
): Decimal {
  if (daysLate <= 0) return new Decimal(0);
  const dailyRate = monthlyRate.div(30);
  return baseAmount
    .mul(dailyRate)
    .mul(daysLate)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
}

/**
 * Format a Decimal as Colombian Pesos string.
 * @example formatCOP(332500) → "$ 332.500"
 */
export function formatCOP(amount: Decimal | number): string {
  const n = typeof amount === 'number' ? amount : amount.toNumber();
  return `$ ${n.toLocaleString('es-CO')}`;
}
```

---

### `billing.service.ts` — The Full Billing Engine

```typescript
// apps/api/src/billing/billing.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import Decimal from 'decimal.js';
import { BillingSnapshot } from '@repo/types';
import { daysFromDueDate, getBillingDates, nowInColombia } from './helpers/colombia-dates';
import { applyDiscount, calculateMora } from './helpers/cop-math';

@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Calculates the exact amount a unit owes at this moment in Colombian time.
   *
   * Timeline enforced:
   *   Days  1–10  (of billing month): PRONTO_PAGO — base amount minus discount rate
   *   Days 11–EOM:                    TARIFA_PLENA — base amount, no adjustment
   *   Days EOM+1 onward:              MORA — base amount plus daily accruing late fees
   *
   * If a unit has MULTIPLE unpaid charges (e.g., missed last month too),
   * each charge is evaluated independently against ITS OWN billing period.
   * This prevents applying pronto pago to an already-late charge.
   */
  async calculateCurrentBalance(unitId: string): Promise<BillingSnapshot> {
    // ── 1. Fetch unit with its conjunto config ──────────────────────────────
    const unit = await this.prisma.unit.findUnique({
      where: { id: unitId },
      include: {
        conjunto: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    if (!unit) {
      throw new NotFoundException(`Unit ${unitId} not found`);
    }

    // ── 2. Fetch ALL unpaid charges for this unit ───────────────────────────
    // We include the billing period to evaluate each charge's timeline.
    const unpaidCharges = await this.prisma.charge.findMany({
      where: {
        unit_id: unitId,
        // A charge is unpaid if its total_amount > paid_amount (or paid_amount is null)
        // We use a raw filter since Prisma doesn't support column-to-column comparison directly
        total_amount: { gt: 0 },
      },
      include: {
        billing_period: true,
      },
      orderBy: {
        billing_period: { period_year: 'asc' },
      },
    });

    // Filter to truly unpaid charges (paid_amount < total_amount)
    // paid_amount is added to Charge in an addendum to the schema
    const actuallyUnpaid = unpaidCharges.filter((charge) => {
      const paid = new Decimal(charge.paid_amount ?? 0);
      const total = new Decimal(charge.total_amount);
      return paid.lessThan(total);
    });

    if (actuallyUnpaid.length === 0) {
      // Unit is fully paid up — return a zero-balance snapshot
      return this.buildZeroBalanceSnapshot(unit);
    }

    const now = nowInColombia();

    // ── 3. Evaluate each charge independently ──────────────────────────────
    let totalBaseAmount = new Decimal(0);
    let totalDiscountAmount = new Decimal(0);
    let totalLateFeesAmount = new Decimal(0);

    // For the snapshot metadata, we report the CURRENT period's billing phase.
    // If there are multiple periods, we still show the current month's phase.
    const currentMonth = now.getMonth() + 1;
    const currentYear = now.getFullYear();

    // Find the current period's charge (if it exists) for phase reporting
    const currentPeriodCharge = actuallyUnpaid.find(
      (c) =>
        c.billing_period.period_month === currentMonth &&
        c.billing_period.period_year === currentYear,
    );

    for (const charge of actuallyUnpaid) {
      const period = charge.billing_period;
      const alreadyPaid = new Decimal(charge.paid_amount ?? 0);
      const remainingBase = new Decimal(charge.total_amount).minus(alreadyPaid);

      const { prontoPagoDeadline, tarifaPlenaDeadline } = getBillingDates(
        period.period_month,
        period.period_year,
      );

      // How many days past the tarifa plena deadline? (i.e., past end of month)
      const daysLate = daysFromDueDate(tarifaPlenaDeadline);
      // How many days from the pronto pago deadline?
      const daysFromProntoPago = daysFromDueDate(prontoPagoDeadline);

      totalBaseAmount = totalBaseAmount.plus(remainingBase);

      if (daysFromProntoPago < 0) {
        // ── PRONTO PAGO: before or on day 10 of the billing month ────────
        // Apply discount to this charge
        const discountRate = new Decimal(period.pronto_pago_rate ?? 0);
        const discount = applyDiscount(remainingBase, discountRate);
        totalDiscountAmount = totalDiscountAmount.plus(discount);
        // No mora on a current-period charge
      } else if (daysLate <= 0) {
        // ── TARIFA PLENA: after day 10 but still within the month ────────
        // No discount, no mora. Pay base amount.
        // Nothing to add to totalDiscountAmount or totalLateFeesAmount
      } else {
        // ── MORA: past end of the billing month ──────────────────────────
        // Mora accrues on the ORIGINAL base amount, not the remaining (legal requirement)
        // This prevents a partial payment from resetting the mora base
        const moraBase = new Decimal(charge.base_amount);
        const monthlyMoraRate = new Decimal(period.late_fee_rate);
        const mora = calculateMora(moraBase, monthlyMoraRate, daysLate);
        totalLateFeesAmount = totalLateFeesAmount.plus(mora);
      }
    }

    // ── 4. Compute final amount due ─────────────────────────────────────────
    // totalDue = base - discounts + mora
    const totalDue = totalBaseAmount
      .minus(totalDiscountAmount)
      .plus(totalLateFeesAmount)
      .toDecimalPlaces(0, Decimal.ROUND_HALF_UP);

    // ── 5. Determine billing phase for the snapshot ─────────────────────────
    let billingPhase: BillingSnapshot['billingPhase'] = 'TARIFA_PLENA';
    let daysFromDue = 0;
    let dueDate = new Date();
    let discountDeadline = new Date();
    let prontoPagoRate = 0;
    let moraRate = 0;

    if (currentPeriodCharge) {
      const period = currentPeriodCharge.billing_period;
      const { prontoPagoDeadline, tarifaPlenaDeadline } = getBillingDates(
        period.period_month,
        period.period_year,
      );

      daysFromDue = daysFromDueDate(prontoPagoDeadline);
      dueDate = prontoPagoDeadline;
      discountDeadline = prontoPagoDeadline;
      prontoPagoRate = Number(period.pronto_pago_rate ?? 0);
      moraRate = Number(period.late_fee_rate);

      if (daysFromDue < 0) {
        billingPhase = 'PRONTO_PAGO';
      } else if (daysFromDueDate(tarifaPlenaDeadline) <= 0) {
        billingPhase = 'TARIFA_PLENA';
      } else {
        billingPhase = 'MORA';
      }
    } else {
      // No current period charge — all outstanding charges are from previous months
      // They are all in mora
      billingPhase = 'MORA';
    }

    // ── 6. Build the period label ───────────────────────────────────────────
    const periodLabel = currentPeriodCharge
      ? this.formatPeriodLabel(
          currentPeriodCharge.billing_period.period_month,
          currentPeriodCharge.billing_period.period_year,
        )
      : `Múltiples períodos (${actuallyUnpaid.length})`;

    // ── 7. Log balance check to audit_log ──────────────────────────────────
    // (non-blocking — don't await, balance check is read-only)
    this.prisma.auditLog
      .create({
        data: {
          conjunto_id: unit.conjunto_id,
          action: 'billing.balance_checked',
          entity_type: 'Unit',
          entity_id: unitId,
          metadata: {
            totalDue: totalDue.toString(),
            billingPhase,
            chargeCount: actuallyUnpaid.length,
          },
        },
      })
      .catch(() => {
        // Audit log failure should never break the billing query
      });

    // ── 8. Return the snapshot ──────────────────────────────────────────────
    return {
      unitId,
      unitNumber: unit.unit_number,
      billingPeriodId: currentPeriodCharge?.billing_period_id ?? '',
      periodLabel,
      baseAmount: totalBaseAmount.toNumber(),
      discountAmount: totalDiscountAmount.toNumber(),
      lateFeesAmount: totalLateFeesAmount.toNumber(),
      totalDue: totalDue.toNumber(),
      billingPhase,
      daysFromDueDate: daysFromDue,
      dueDate: dueDate.toISOString(),
      discountDeadline: discountDeadline.toISOString(),
      prontoPagoRate,
      moraRate,
      outstandingChargeIds: actuallyUnpaid.map((c) => c.id),
    };
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private buildZeroBalanceSnapshot(unit: { id: string; unit_number: string; conjunto_id: string }): BillingSnapshot {
    const now = nowInColombia();
    return {
      unitId: unit.id,
      unitNumber: unit.unit_number,
      billingPeriodId: '',
      periodLabel: '',
      baseAmount: 0,
      discountAmount: 0,
      lateFeesAmount: 0,
      totalDue: 0,
      billingPhase: 'TARIFA_PLENA',
      daysFromDueDate: 0,
      dueDate: now.toISOString(),
      discountDeadline: now.toISOString(),
      prontoPagoRate: 0,
      moraRate: 0,
      outstandingChargeIds: [],
    };
  }

  private formatPeriodLabel(month: number, year: number): string {
    const monthNames = [
      'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
    ];
    return `${monthNames[month - 1]} ${year}`;
  }

  /**
   * Generates ALL charges for a given conjunto for the current month.
   * Called by the monthly cron job on the 1st of each month.
   */
  async generateMonthlyCharges(conjuntoId: string): Promise<{ chargesCreated: number }> {
    const now = nowInColombia();
    const month = now.getMonth() + 1;
    const year = now.getFullYear();

    // Idempotency: check if billing period already exists
    const existingPeriod = await this.prisma.billingPeriod.findUnique({
      where: {
        conjunto_id_period_month_period_year: {
          conjunto_id: conjuntoId,
          period_month: month,
          period_year: year,
        },
      },
    });

    if (existingPeriod) {
      throw new BadRequestException(
        `Billing period ${month}/${year} already exists for conjunto ${conjuntoId}`,
      );
    }

    // Fetch conjunto config for pronto pago rate
    const conjunto = await this.prisma.conjunto.findUnique({
      where: { id: conjuntoId },
      include: {
        units: {
          where: { is_active: true },
          select: { id: true, monthly_fee: true },
        },
      },
    });

    if (!conjunto) throw new NotFoundException(`Conjunto ${conjuntoId} not found`);

    const { tarifaPlenaDeadline } = getBillingDates(month, year);

    // Create the billing period + all unit charges in one transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const period = await tx.billingPeriod.create({
        data: {
          conjunto_id: conjuntoId,
          period_month: month,
          period_year: year,
          due_date: tarifaPlenaDeadline,
          // These rates come from conjunto config — add to Conjunto model
          late_fee_rate: conjunto.mora_rate ?? new Decimal('0.015'),
          pronto_pago_rate: conjunto.pronto_pago_rate ?? new Decimal('0.05'),
          is_closed: false,
        },
      });

      const charges = await tx.charge.createMany({
        data: conjunto.units.map((unit) => ({
          unit_id: unit.id,
          billing_period_id: period.id,
          base_amount: unit.monthly_fee,
          late_fee_amount: new Decimal(0),
          total_amount: unit.monthly_fee, // Will be recalculated dynamically by calculateCurrentBalance
          paid_amount: new Decimal(0),
        })),
      });

      return charges;
    });

    return { chargesCreated: result.count };
  }
}
```

---

### Schema Addendum

Two fields need to be added to the Prisma schema to support the billing engine:

```prisma
// Add to Conjunto model:
mora_rate           Decimal  @default(0.0150) @db.Decimal(5, 4)
pronto_pago_rate    Decimal  @default(0.0500) @db.Decimal(5, 4)

// Add to Charge model:
paid_amount         Decimal  @default(0) @db.Decimal(12, 2)
pronto_pago_rate    Decimal? @db.Decimal(5, 4) // Snapshot at time of period creation

// Add to BillingPeriod model:
pronto_pago_rate    Decimal  @default(0.0500) @db.Decimal(5, 4)
```

---

### Unit Tests for the Billing Engine

```typescript
// billing.service.spec.ts
import { Test } from '@nestjs/testing';
import { BillingService } from './billing.service';
import { daysFromDueDate, getBillingDates } from './helpers/colombia-dates';
import { calculateMora, applyDiscount } from './helpers/cop-math';
import Decimal from 'decimal.js';

describe('Colombian Billing Timeline', () => {
  describe('getBillingDates()', () => {
    it('should set pronto pago deadline to day 10 of the billing month', () => {
      const { prontoPagoDeadline } = getBillingDates(6, 2025);
      expect(prontoPagoDeadline.getDate()).toBe(10);
      expect(prontoPagoDeadline.getMonth() + 1).toBe(6);
    });

    it('should set mora start to day 1 of the following month', () => {
      const { moraStartDate } = getBillingDates(6, 2025);
      expect(moraStartDate.getDate()).toBe(1);
      expect(moraStartDate.getMonth() + 1).toBe(7);
    });
  });

  describe('applyDiscount()', () => {
    it('should calculate 5% pronto pago on $350,000', () => {
      const discount = applyDiscount(new Decimal(350000), new Decimal(0.05));
      expect(discount.toNumber()).toBe(17500);
    });

    it('should round fractional pesos correctly', () => {
      // $333,333 × 5% = $16,666.65 → rounds to $16,667
      const discount = applyDiscount(new Decimal(333333), new Decimal(0.05));
      expect(discount.toNumber()).toBe(16667);
    });
  });

  describe('calculateMora()', () => {
    it('should calculate 15 days of mora at 1.5% monthly', () => {
      // $350,000 × (0.015/30) × 15 = $2,625
      const mora = calculateMora(new Decimal(350000), new Decimal(0.015), 15);
      expect(mora.toNumber()).toBe(2625);
    });

    it('should return zero mora for non-late charges', () => {
      const mora = calculateMora(new Decimal(350000), new Decimal(0.015), 0);
      expect(mora.toNumber()).toBe(0);
    });

    it('should return zero mora for negative daysLate', () => {
      const mora = calculateMora(new Decimal(350000), new Decimal(0.015), -5);
      expect(mora.toNumber()).toBe(0);
    });

    it('should calculate 60 days mora correctly', () => {
      // $350,000 × (0.015/30) × 60 = $10,500
      const mora = calculateMora(new Decimal(350000), new Decimal(0.015), 60);
      expect(mora.toNumber()).toBe(10500);
    });
  });
});
```

---

### Dependencies to Install

```bash
# In apps/api
npm install decimal.js date-fns @date-fns/tz
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
npm install axios                        # for Wompi API calls
npm install bullmq ioredis               # for async job processing
npm install @nestjs/schedule             # for cron billing trigger

# Dev
npm install -D @types/multer
```

---

### Environment Variables Required

```bash
# .env (apps/api)
DATABASE_URL="postgresql://..."
CLERK_SECRET_KEY="sk_live_..."
CLERK_PUBLISHABLE_KEY="pk_live_..."

# Cloudflare R2
CF_ACCOUNT_ID="abc123"
R2_ACCESS_KEY_ID="..."
R2_SECRET_ACCESS_KEY="..."
R2_BUCKET_NAME="ph-documents-prod"

# Wompi
WOMPI_PUBLIC_KEY="pub_prod_..."
WOMPI_PRIVATE_KEY="prv_prod_..."
WOMPI_EVENTS_KEY="..."           # Used for webhook HMAC verification
WOMPI_INTEGRITY_KEY="..."        # Used for payment link integrity hash

# Redis (Upstash or self-hosted)
REDIS_URL="redis://..."

# App
APP_URL="https://app.tuconjunto.co"
```
