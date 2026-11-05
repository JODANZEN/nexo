# Colombian PropTech SaaS — Architecture & Market Blueprint

> **Platform:** Residential Experience & Property Management for Propiedad Horizontal (PH)
> **Jurisdiction:** Colombia · Ley 675/2001 · Ley 1581/2012 (Habeas Data)

---

## Part 1: Market & Feature Blueprint

### 1.1 — Three Critical Gaps in Existing Colombian PH Software

---

#### Gap 1: No Unified Resident-Facing Mobile Experience

Sipho, Kipo, and Propiedata are **administrator-first** tools. Their interfaces are built for the Administrador del Conjunto, not the resident. They produce reports, manage cuotas de administración, and log PQRs — but residents interact through WhatsApp groups, phone calls, or a bulletin board in the portería. There is no native mobile app where a resident can:

- Pay their cuota in-app via Nequi/PSE
- Submit and track a PQR (petition/complaint/request)
- Vote in an Asamblea with a tamper-evident audit trail
- Pre-authorize a visitor with a time-bound QR code

**Exploit:** A resident-first mobile app (iOS/Android) with a clean UX is a greenfield opportunity. The administrator console becomes secondary. Acquisition happens through residents demanding it, not administrators selecting it.

---

#### Gap 2: Portería Module is Universally Broken or Absent

The guard station (portería) is the operational heartbeat of any conjunto cerrado. Yet existing software treats it as an afterthought — at best, a shared spreadsheet on a tablet. Critical failures in the current market:

- **No delivery management:** Rappi and MercadoLibre have exploded in Colombia. Guards manually log packages on paper or WhatsApp the resident. There is no chain of custody.
- **No visitor pre-authorization:** Guests are registered on arrival with zero prior notification to the resident.
- **No integration with video intercoms:** IP intercom systems (Akuvox, 2N) exist in premium buildings but are never integrated with the PH software.
- **Habeas Data violation risk:** Guards photograph visitor IDs and store them in WhatsApp chats — a direct violation of Ley 1581/2012.

**Exploit:** A Portería Module built mobile-first for the guard, with QR-code visitor pre-auth, delivery chain-of-custody photos stored in compliant encrypted storage, and a WebRTC/SIP softphone integration for intercoms — not as premium features, but as core MVP.

---

#### Gap 3: Digital Asamblea with Legal-Grade Audit Trail

Virtual asambleas became legally valid in Colombia under Decreto 398/2020 (amended by Ley 2106/2021), but no existing PH software has built a native, legally compliant voting module. Administrators still use Zoom + a separate Google Form + a manual quorum spreadsheet. Problems:

- **Quorum verification is manual** and easily disputed.
- **Proxy vote handling** (poder) is done via scanned PDFs sent to WhatsApp.
- **Minutes (Actas)** must be signed and notarized in many cases; no software generates a legally structured Acta automatically.
- **No coeficiente weighting:** Votes in a PH Asamblea are not 1-person-1-vote — they are weighted by the coeficiente de copropiedad of each unit (Art. 37, Ley 675/2001). No existing app handles this natively.

**Exploit:** Build an Asamblea module where: (1) quorum is computed automatically from coeficientes, (2) proxy votes upload a signed poder PDF linked to the grantor's unit, (3) votes are recorded with a cryptographic hash chain, and (4) the system auto-generates a structured Acta PDF ready for the Administrador's signature.

---

### 1.2 — MVP Feature Matrix by User Role

---

#### RESIDENT

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Payment Portal** | Pay cuota de administración via PSE, Nequi, or DaviPlata. View payment history, pending balance, and downloadable paz y salvo PDF. |
| 2 | **PQR Ticketing** | Submit petitions, quejas, reclamos with photo attachments. Real-time status tracking (open → in review → resolved). Push notification on status change. |
| 3 | **Visitor Pre-Auth QR** | Generate a time-bound (date + time window) QR code for a specific guest. QR is scanned by guard at entry. Resident receives push notification on arrival. |
| 4 | **Document Vault** | Secure access to own documents only: signed lease/deed, paz y salvo history, assembly minutes. Served via presigned URLs — never a public link. |
| 5 | **Asamblea Voting** | Join virtual assembly, cast weighted vote, upload poder PDF for proxy representation. View results in real-time after quorum is reached. |

---

#### ADMINISTRATOR (Administrador del Conjunto)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **Financial Dashboard** | Cartera (accounts receivable) by unit, cuota collection rate, upcoming expenses. Export to Excel/PDF for Revisor Fiscal. |
| 2 | **Billing Engine** | Auto-generate monthly cuotas per unit based on coeficiente. Bulk-send payment links via WhatsApp/email. Apply recargos moratorios (late fees) per Reglamento. |
| 3 | **PQR Management** | Receive, assign, and resolve PQRs. Internal notes visible only to admin staff. SLA tracking. |
| 4 | **Document Management** | Upload PDFs to secure storage (S3/R2). Assign document visibility to: all residents, specific unit, admin-only. Trigger Habeas Data consent flow on first upload of personal documents. |
| 5 | **Asamblea Orchestration** | Schedule assembly, set agenda, compute quorum threshold from coeficientes, open/close voting per agenda item, generate and export Acta PDF with digital signature. |

---

#### SECURITY GUARD (Portero)

| # | Feature | Description |
|---|---------|-------------|
| 1 | **QR Visitor Scan** | Scan resident-generated visitor QR via tablet camera. App validates: QR not expired, not revoked, matches visit window. Shows unit and resident name — no excess visitor data stored. |
| 2 | **Walk-in Visitor Log** | Register unannounced visitor: capture name, document number (encrypted at rest), destination unit. Notify resident via push and await approval (approve/deny from their phone). Habeas Data consent notice shown on guard tablet before capture. |
| 3 | **Delivery Management** | Log incoming package: carrier (Rappi, MercadoLibre, Servientrega), unit, photo of package label. Notify resident. Resident signs off on pickup via in-app confirmation. Chain-of-custody photo stored encrypted. |
| 4 | **Intercom Softphone** | WebRTC or SIP-based soft phone tab. Guard dials unit extension; resident answers in mobile app. No external phone number required. |
| 5 | **Incident Log** | Quick-form incident reporting with mandatory category (noise, security breach, structural, etc.), optional photo, and automatic timestamp + guard identity stamp. Routed to Administrator PQR queue. |

---

## Part 2: Technical Architecture & Security Strategy

### 2.1 — Proposed Tech Stack

---

#### Frontend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Mobile App | **React Native (Expo)** | Single codebase for iOS/Android. Expo EAS Build for OTA updates. Critical for Portería tablet (Android) and Resident phone. |
| Web Admin Console | **Next.js 14 (App Router)** | SSR for SEO on marketing pages; RSC for fast admin dashboards. Deploy to Vercel or self-hosted on Railway. |
| Component Library | **shadcn/ui + Tailwind CSS** | Headless, fully customizable. No license risk. |
| State Management | **Zustand** (client) + **TanStack Query** (server state) | Lightweight, avoids Redux boilerplate. TanStack Query handles cache invalidation for real-time cartera data. |

---

#### Backend

| Layer | Choice | Rationale |
|-------|--------|-----------|
| API Framework | **NestJS (TypeScript)** | Modular architecture maps cleanly to PH domains (units, payments, documents). Built-in guards for RBAC. |
| Auth | **Clerk** or **Auth.js + PostgreSQL** | Clerk handles SMS OTP (critical — many Colombian residents don't use email). If self-hosted: Auth.js with `phone` provider via Twilio/AWS SNS. |
| Real-time | **Socket.io** (on NestJS gateway) | Visitor arrival push, delivery notifications, Asamblea live vote counts. |
| Background Jobs | **BullMQ + Redis** | Async jobs: PDF generation, payment webhook processing, bulk cuota billing runs. |
| PDF Generation | **Puppeteer** (headless Chrome) or **@react-pdf/renderer** | Generate Actas, paz y salvo, payment receipts as structured PDFs. Store immediately to S3/R2 after generation — never serve from compute. |
| Intercom / WebRTC | **Twilio Programmable Voice** or **LiveKit (self-hosted)** | LiveKit preferred: self-hostable on a $20/mo VPS, no per-minute cost, SIP trunk optional. |

---

#### Database

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Primary DB | **PostgreSQL 15** (via Supabase or Neon) | ACID compliance for financial data. Row-Level Security (RLS) for multi-tenancy enforcement at the DB layer. Supabase gives you RLS + Realtime out of the box. |
| ORM | **Prisma** | Type-safe schema, migrations, strong TypeScript integration with NestJS. |
| Cache / Queue | **Redis** (Upstash serverless or self-hosted) | BullMQ job queues, session cache, rate limiting per conjuntoId. |
| Search | **PostgreSQL full-text search** (MVP) → **Typesense** (post-MVP) | PQR and document search. Typesense is open-source, self-hostable, GDPR/Habeas Data safe (no data leaves your infra). |

---

#### Cloud & Infrastructure

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Cloud Provider | **AWS (São Paulo region — sa-east-1)** | Closest region to Colombia with full AWS service coverage. Data residency for Habeas Data compliance. |
| Object Storage | **Cloudflare R2** | Zero egress fees (critical for PDF delivery at scale). S3-compatible API. Pairs with Cloudflare Workers for presigned URL generation at edge. |
| CDN | **Cloudflare** | Free tier covers most traffic. Workers handle presigned URL signing logic. |
| Container Orchestration | **Railway** (MVP) → **AWS ECS Fargate** (scale) | Railway removes DevOps overhead at launch. Migrate to Fargate when you need auto-scaling and VPC isolation. |
| CI/CD | **GitHub Actions** | Build → test → migrate DB (Prisma migrate deploy) → deploy. |
| Monitoring | **Sentry** (errors) + **Grafana Cloud** (metrics) + **Axiom** (logs) | All have generous free tiers. |

---

### 2.2 — Secure PDF Storage: Infrastructure & Workflow

This is the most security-critical feature. The threat model: a tenant (Conjunto A) must never access a document belonging to Conjunto B or even a neighbor in the same building.

---

#### Storage Key Architecture (Cloudflare R2)

All objects are stored with a path that encodes the tenancy hierarchy:

```
conjuntos/{conjuntoId}/units/{unitId}/documents/{documentId}/{filename}.pdf
```

**Example:**
```
conjuntos/cj_01HXYZ/units/ut_0042/documents/doc_8821/contrato_arrendamiento_2024.pdf
```

The `conjuntoId` is a CUID2, never a sequential integer. This prevents enumeration attacks. The full path is never exposed to the client.

---

#### Presigned URL Generation Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (Mobile/Web)                       │
└────────────────────────────┬────────────────────────────────────┘
                             │ GET /api/documents/{documentId}/url
                             │ Authorization: Bearer <JWT>
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     NestJS API (DocumentsGuard)                  │
│                                                                   │
│  1. Verify JWT → extract userId, conjuntoId, role               │
│  2. Query DB: SELECT * FROM documents WHERE id = {documentId}   │
│  3. RBAC Check:                                                   │
│     - Is document.conjuntoId === user.conjuntoId? (tenant gate) │
│     - Does user.role satisfy document.visibilityLevel?           │
│       (RESIDENT can only see own unit docs or public PH docs)   │
│     - Is user.unitId === document.unitId? (unit-level gate)     │
│  4. If all pass → call R2 presigned URL generator               │
│  5. Log access event to audit_log table                          │
└────────────────────────────┬────────────────────────────────────┘
                             │ sign(r2Path, expiresIn: 300s)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Cloudflare R2 / Worker                        │
│                                                                   │
│  Signs URL using HMAC-SHA256 with R2 secret key                 │
│  Returns: https://r2.yourdomain.co/conjuntos/.../file.pdf       │
│           ?X-Amz-Expires=300&X-Amz-Signature=abc123            │
└────────────────────────────┬────────────────────────────────────┘
                             │ Presigned URL (300-second TTL)
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLIENT renders PDF                           │
│  (URL expires in 5 min — not shareable, not cacheable by CDN)  │
└─────────────────────────────────────────────────────────────────┘
```

---

#### RBAC Model for Documents

```typescript
// Document visibility levels
enum DocumentVisibility {
  ADMIN_ONLY      = 'ADMIN_ONLY',      // Revisor Fiscal, admin staff
  UNIT_OWNER      = 'UNIT_OWNER',      // The propietario of that specific unit
  UNIT_OCCUPANT   = 'UNIT_OCCUPANT',   // Includes arrendatario (tenant)
  ALL_RESIDENTS   = 'ALL_RESIDENTS',   // E.g., Assembly minutes (Actas)
  PUBLIC          = 'PUBLIC',          // Marketing docs, reglamento PH
}

// Guard logic (NestJS)
function canAccessDocument(user: AuthUser, doc: Document): boolean {
  // Hard tenant isolation — no exceptions
  if (user.conjuntoId !== doc.conjuntoId) return false;

  switch (doc.visibility) {
    case DocumentVisibility.ADMIN_ONLY:
      return ['ADMIN', 'REVISOR_FISCAL'].includes(user.role);
    case DocumentVisibility.UNIT_OWNER:
      return user.role === 'ADMIN' || 
             (user.unitId === doc.unitId && user.occupancyType === 'OWNER');
    case DocumentVisibility.UNIT_OCCUPANT:
      return user.role === 'ADMIN' || user.unitId === doc.unitId;
    case DocumentVisibility.ALL_RESIDENTS:
      return ['ADMIN', 'RESIDENT', 'GUARD'].includes(user.role);
    case DocumentVisibility.PUBLIC:
      return true;
  }
}
```

---

#### Multi-Tenant Isolation Strategy

Three independent layers enforce isolation — all three must pass:

**Layer 1 — JWT Claims:** Every JWT encodes `{ userId, conjuntoId, unitId, role }`. The `conjuntoId` is signed by your auth server. A user cannot forge a different `conjuntoId` without invalidating the signature.

**Layer 2 — Application RBAC:** The `canAccessDocument()` guard above checks `conjuntoId` match before any DB query returns data. This is the primary application-level gate.

**Layer 3 — PostgreSQL Row-Level Security (RLS):**

```sql
-- Enable RLS on all tenant-scoped tables
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;

-- Policy: app passes conjuntoId via session variable
CREATE POLICY tenant_isolation ON documents
  USING (conjunto_id = current_setting('app.current_conjunto_id')::uuid);

-- In NestJS, set before every query:
-- SET LOCAL app.current_conjunto_id = 'cj_01HXYZ';
```

This means even if there's an application bug that forgets the RBAC check, the database itself refuses to return rows from another tenant. Defense in depth.

---

#### Habeas Data Compliance (Ley 1581/2012)

- **Visitor data:** Document number captured at portería is **AES-256 encrypted at the application layer** before storage. The encryption key is stored in AWS Secrets Manager, not in the database. The guard sees the name; the raw cédula number is never queryable in plaintext.
- **Consent:** First login triggers an in-app Política de Privacidad acceptance flow. Consent is recorded with timestamp and IP in a `consent_records` table.
- **Right to erasure:** A `data_deletion_requests` table tracks SARs (Subject Access Requests). A background job anonymizes PII fields (replaces with `[ELIMINADO]`) rather than hard-deleting, to preserve financial audit trails.
- **Data retention:** Visitor logs are auto-purged after 30 days via a nightly BullMQ job. Payment records are retained 5 years (DIAN tax requirement).

---

## Part 3: Database Schema Blueprint

> Format: **Prisma Schema** — maps directly to PostgreSQL. All IDs use CUID2 (collision-resistant, non-sequential, safe for public exposure).

```prisma
// schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ─────────────────────────────────────────────
// ENUMS
// ─────────────────────────────────────────────

enum UserRole {
  SUPER_ADMIN       // Platform operator (your team)
  ADMIN             // Administrador del Conjunto
  REVISOR_FISCAL    // Read-only financial auditor
  RESIDENT          // Propietario or Arrendatario
  GUARD             // Portero
}

enum OccupancyType {
  OWNER             // Propietario living in the unit
  OWNER_ABSENT      // Propietario not living there (renting it out)
  TENANT            // Arrendatario
}

enum DocumentVisibility {
  ADMIN_ONLY
  UNIT_OWNER
  UNIT_OCCUPANT
  ALL_RESIDENTS
  PUBLIC
}

enum DocumentStatus {
  PENDING_UPLOAD
  ACTIVE
  SUPERSEDED      // Replaced by a newer version
  DELETED
}

enum PaymentStatus {
  PENDING
  PROCESSING
  PAID
  FAILED
  REFUNDED
}

enum PaymentMethod {
  PSE
  NEQUI
  DAVIPLATA
  CASH            // Paid in person to admin
  BANK_TRANSFER
}

enum VisitorStatus {
  PRE_AUTHORIZED  // QR generated by resident, not yet used
  CHECKED_IN
  CHECKED_OUT
  EXPIRED
  REVOKED
}

enum PqrCategory {
  NOISE
  MAINTENANCE
  SECURITY
  FINANCIAL
  COEXISTENCE
  OTHER
}

enum PqrStatus {
  OPEN
  IN_REVIEW
  RESOLVED
  CLOSED
}

enum AsambleaStatus {
  SCHEDULED
  QUORUM_OPEN     // Accepting check-ins, counting toward quorum
  IN_PROGRESS
  VOTING_CLOSED
  COMPLETED
  CANCELLED
}

// ─────────────────────────────────────────────
// TENANT ROOT: CONJUNTO
// Represents one Propiedad Horizontal entity.
// All other tables scope to this via conjunto_id.
// ─────────────────────────────────────────────

model Conjunto {
  id                String    @id @default(cuid())
  name              String    // "Conjunto Residencial El Nogal"
  nit               String    @unique // Colombian tax ID for the PH entity
  address           String
  city              String
  department        String
  reglamento_ph_url String?   // Presigned URL ref to reglamento document
  total_units       Int
  created_at        DateTime  @default(now())
  updated_at        DateTime  @updatedAt

  // Relations
  units             Unit[]
  users             User[]
  documents         Document[]
  payments          Payment[]
  pqrs              Pqr[]
  asambleas         Asamblea[]
  visitor_logs      VisitorLog[]
  delivery_logs     DeliveryLog[]
  billing_periods   BillingPeriod[]
  consent_records   ConsentRecord[]
  audit_logs        AuditLog[]

  @@map("conjuntos")
}

// ─────────────────────────────────────────────
// UNIT (Apartamento / Casa / Local)
// Represents a single coproperty unit.
// ─────────────────────────────────────────────

model Unit {
  id                  String   @id @default(cuid())
  conjunto_id         String
  unit_number         String   // "301", "Casa 12", "Local 3"
  floor               Int?
  tower               String?  // "Torre A", "Torre B"
  // coeficiente: determines voting weight and admin fee share
  // Stored as DECIMAL to avoid floating-point errors
  coeficiente         Decimal  @db.Decimal(10, 6)
  monthly_fee         Decimal  @db.Decimal(12, 2) // COP, auto-computed from coeficiente
  is_commercial       Boolean  @default(false)
  created_at          DateTime @default(now())
  updated_at          DateTime @updatedAt

  // Relations
  conjunto            Conjunto        @relation(fields: [conjunto_id], references: [id])
  occupancies         UnitOccupancy[]
  documents           Document[]
  payments            Payment[]
  pqrs                Pqr[]
  visitor_logs        VisitorLog[]
  delivery_logs       DeliveryLog[]
  asamblea_votes      AsambleaVote[]
  charges             Charge[]

  @@unique([conjunto_id, unit_number])
  @@index([conjunto_id])
  @@map("units")
}

// ─────────────────────────────────────────────
// USER
// Platform users. A person can be linked to
// multiple units (e.g., owns two apartments).
// ─────────────────────────────────────────────

model User {
  id              String    @id @default(cuid())
  conjunto_id     String
  external_auth_id String?  @unique // Clerk user ID or Auth.js session ref
  email           String?
  phone           String    // Primary auth method in Colombia (+57...)
  full_name       String
  cedula_hash     String?   // SHA-256 hash of cédula — for identity checks only, never raw
  role            UserRole
  is_active       Boolean   @default(true)
  push_token      String?   // FCM / APNs token for push notifications
  created_at      DateTime  @default(now())
  updated_at      DateTime  @updatedAt

  // Relations
  conjunto        Conjunto        @relation(fields: [conjunto_id], references: [id])
  occupancies     UnitOccupancy[]
  documents_uploaded Document[]  @relation("UploadedBy")
  pqrs_submitted  Pqr[]          @relation("SubmittedBy")
  pqrs_assigned   Pqr[]          @relation("AssignedTo")
  consent_records ConsentRecord[]
  audit_logs      AuditLog[]
  asamblea_attendances AsambleaAttendance[]
  asamblea_votes  AsambleaVote[]
  visitor_qr_codes VisitorQrCode[]

  @@index([conjunto_id])
  @@index([phone])
  @@map("users")
}

// ─────────────────────────────────────────────
// UNIT OCCUPANCY
// Resolves the owner/tenant relationship.
// A unit may have one active OWNER and one
// active TENANT simultaneously. History is kept.
// ─────────────────────────────────────────────

model UnitOccupancy {
  id              String        @id @default(cuid())
  unit_id         String
  user_id         String
  occupancy_type  OccupancyType
  started_at      DateTime
  ended_at        DateTime?     // NULL = currently active
  // Contract reference for tenants
  lease_document_id String?

  // Relations
  unit            Unit          @relation(fields: [unit_id], references: [id])
  user            User          @relation(fields: [user_id], references: [id])
  lease_document  Document?     @relation(fields: [lease_document_id], references: [id])

  @@index([unit_id])
  @@index([user_id])
  // Enforce: max one active OWNER and one active TENANT per unit
  @@unique([unit_id, occupancy_type, ended_at])
  @@map("unit_occupancies")
}

// ─────────────────────────────────────────────
// DOCUMENT (Secure PDF Storage)
// Metadata only. Actual file lives in R2.
// ─────────────────────────────────────────────

model Document {
  id              String              @id @default(cuid())
  conjunto_id     String
  unit_id         String?             // NULL = conjunto-wide document (e.g., Acta)
  uploaded_by_id  String
  title           String
  description     String?
  // r2_key: the full object path in R2 — never exposed to clients
  r2_key          String              @unique
  mime_type       String              @default("application/pdf")
  file_size_bytes Int
  visibility      DocumentVisibility  @default(ADMIN_ONLY)
  status          DocumentStatus      @default(ACTIVE)
  // For versioning: superseded documents point to their replacement
  superseded_by_id String?
  // Habeas Data: track if this doc contains personal data
  contains_pii    Boolean             @default(false)
  created_at      DateTime            @default(now())
  updated_at      DateTime            @updatedAt

  // Relations
  conjunto        Conjunto            @relation(fields: [conjunto_id], references: [id])
  unit            Unit?               @relation(fields: [unit_id], references: [id])
  uploaded_by     User                @relation("UploadedBy", fields: [uploaded_by_id], references: [id])
  superseded_by   Document?           @relation("DocumentVersions", fields: [superseded_by_id], references: [id])
  previous_versions Document[]        @relation("DocumentVersions")
  occupancies_as_lease UnitOccupancy[]
  access_logs     DocumentAccessLog[]
  asamblea_acta   Asamblea?           @relation("ActaDocument")

  @@index([conjunto_id])
  @@index([unit_id])
  @@map("documents")
}

// Audit trail: every presigned URL generation is logged
model DocumentAccessLog {
  id            String   @id @default(cuid())
  document_id   String
  accessed_by   String   // userId
  accessed_at   DateTime @default(now())
  ip_address    String?
  user_agent    String?

  document      Document @relation(fields: [document_id], references: [id])

  @@index([document_id])
  @@map("document_access_logs")
}

// ─────────────────────────────────────────────
// BILLING PERIOD
// Monthly billing cycle for the conjunto
// ─────────────────────────────────────────────

model BillingPeriod {
  id            String    @id @default(cuid())
  conjunto_id   String
  period_month  Int       // 1–12
  period_year   Int
  due_date      DateTime
  late_fee_rate Decimal   @db.Decimal(5, 4) // e.g., 0.0150 = 1.5% monthly mora
  is_closed     Boolean   @default(false)
  created_at    DateTime  @default(now())

  conjunto      Conjunto  @relation(fields: [conjunto_id], references: [id])
  charges       Charge[]

  @@unique([conjunto_id, period_month, period_year])
  @@map("billing_periods")
}

// Individual charge per unit per period
model Charge {
  id                String        @id @default(cuid())
  unit_id           String
  billing_period_id String
  base_amount       Decimal       @db.Decimal(12, 2) // COP
  late_fee_amount   Decimal       @db.Decimal(12, 2) @default(0)
  total_amount      Decimal       @db.Decimal(12, 2)
  description       String?
  created_at        DateTime      @default(now())

  unit              Unit          @relation(fields: [unit_id], references: [id])
  billing_period    BillingPeriod @relation(fields: [billing_period_id], references: [id])
  payments          Payment[]

  @@index([unit_id])
  @@map("charges")
}

// ─────────────────────────────────────────────
// PAYMENT
// Tracks a payment transaction against a charge.
// ─────────────────────────────────────────────

model Payment {
  id                  String        @id @default(cuid())
  conjunto_id         String
  unit_id             String
  charge_id           String?       // NULL for manual/partial payments
  amount              Decimal       @db.Decimal(12, 2) // COP
  currency            String        @default("COP")
  method              PaymentMethod
  status              PaymentStatus @default(PENDING)
  // Payment gateway fields (Wompi / ePayco)
  gateway_name        String?       // "wompi" | "epayco"
  gateway_reference   String?       @unique // Gateway transaction ID
  gateway_payload     Json?         // Raw webhook payload from gateway
  pse_bank_code       String?       // PSE-specific: bank selected by user
  nequi_phone         String?       // Nequi: phone number used
  paid_at             DateTime?
  created_at          DateTime      @default(now())
  updated_at          DateTime      @updatedAt

  // Relations
  conjunto            Conjunto      @relation(fields: [conjunto_id], references: [id])
  unit                Unit          @relation(fields: [unit_id], references: [id])
  charge              Charge?       @relation(fields: [charge_id], references: [id])

  @@index([conjunto_id])
  @@index([unit_id])
  @@index([gateway_reference])
  @@map("payments")
}

// ─────────────────────────────────────────────
// PQR (Petición, Queja, Reclamo)
// ─────────────────────────────────────────────

model Pqr {
  id              String      @id @default(cuid())
  conjunto_id     String
  unit_id         String?
  submitted_by_id String
  assigned_to_id  String?
  category        PqrCategory
  status          PqrStatus   @default(OPEN)
  title           String
  description     String
  attachments     String[]    // Array of r2_keys (photos, etc.)
  resolved_at     DateTime?
  created_at      DateTime    @default(now())
  updated_at      DateTime    @updatedAt

  conjunto        Conjunto    @relation(fields: [conjunto_id], references: [id])
  unit            Unit?       @relation(fields: [unit_id], references: [id])
  submitted_by    User        @relation("SubmittedBy", fields: [submitted_by_id], references: [id])
  assigned_to     User?       @relation("AssignedTo", fields: [assigned_to_id], references: [id])
  comments        PqrComment[]

  @@index([conjunto_id])
  @@map("pqrs")
}

model PqrComment {
  id          String   @id @default(cuid())
  pqr_id      String
  author_id   String
  body        String
  is_internal Boolean  @default(false) // Admin-only notes
  created_at  DateTime @default(now())

  pqr         Pqr      @relation(fields: [pqr_id], references: [id])

  @@index([pqr_id])
  @@map("pqr_comments")
}

// ─────────────────────────────────────────────
// ASAMBLEA (HOA Assembly + Voting)
// ─────────────────────────────────────────────

model Asamblea {
  id                  String          @id @default(cuid())
  conjunto_id         String
  title               String          // "Asamblea Ordinaria 2025"
  type                String          // "ORDINARIA" | "EXTRAORDINARIA"
  scheduled_at        DateTime
  quorum_percentage   Decimal         @db.Decimal(5, 2) // e.g., 50.01 (%)
  quorum_reached_at   DateTime?
  status              AsambleaStatus  @default(SCHEDULED)
  // Auto-generated Acta PDF after completion
  acta_document_id    String?         @unique
  meeting_url         String?         // Zoom/Meet link
  created_at          DateTime        @default(now())
  updated_at          DateTime        @updatedAt

  conjunto            Conjunto        @relation(fields: [conjunto_id], references: [id])
  acta_document       Document?       @relation("ActaDocument", fields: [acta_document_id], references: [id])
  agenda_items        AsambleaAgendaItem[]
  attendances         AsambleaAttendance[]
  votes               AsambleaVote[]

  @@index([conjunto_id])
  @@map("asambleas")
}

model AsambleaAgendaItem {
  id            String    @id @default(cuid())
  asamblea_id   String
  order         Int       // Agenda order
  title         String
  description   String?
  voting_open   Boolean   @default(false)
  voting_closed_at DateTime?
  created_at    DateTime  @default(now())

  asamblea      Asamblea  @relation(fields: [asamblea_id], references: [id])
  votes         AsambleaVote[]

  @@map("asamblea_agenda_items")
}

model AsambleaAttendance {
  id              String   @id @default(cuid())
  asamblea_id     String
  user_id         String
  unit_id         String
  // Proxy: this user is voting on behalf of the real owner
  is_proxy        Boolean  @default(false)
  proxy_for_user_id String?
  // poder_document_id: the scanned poder PDF giving proxy rights
  poder_document_id String?
  coeficiente     Decimal  @db.Decimal(10, 6) // Snapshot at time of assembly
  checked_in_at   DateTime @default(now())

  asamblea        Asamblea @relation(fields: [asamblea_id], references: [id])
  user            User     @relation(fields: [user_id], references: [id])

  @@unique([asamblea_id, unit_id]) // One attendance record per unit per assembly
  @@map("asamblea_attendances")
}

model AsambleaVote {
  id              String   @id @default(cuid())
  asamblea_id     String
  agenda_item_id  String
  user_id         String
  unit_id         String
  vote_value      String   // "SI" | "NO" | "ABSTENCION"
  coeficiente     Decimal  @db.Decimal(10, 6) // Vote weight
  // Integrity: SHA-256 hash of (agenda_item_id + unit_id + vote_value + secret)
  vote_hash       String
  voted_at        DateTime @default(now())

  asamblea        Asamblea           @relation(fields: [asamblea_id], references: [id])
  agenda_item     AsambleaAgendaItem @relation(fields: [agenda_item_id], references: [id])
  user            User               @relation(fields: [user_id], references: [id])
  unit            Unit               @relation(fields: [unit_id], references: [id])

  @@unique([agenda_item_id, unit_id]) // One vote per unit per agenda item
  @@index([asamblea_id])
  @@map("asamblea_votes")
}

// ─────────────────────────────────────────────
// PORTERÍA: VISITOR & DELIVERY MANAGEMENT
// ─────────────────────────────────────────────

// QR codes generated by residents for expected visitors
model VisitorQrCode {
  id              String        @id @default(cuid())
  conjunto_id     String
  unit_id         String
  created_by_id   String        // The resident who generated it
  visitor_name    String
  valid_from      DateTime
  valid_until     DateTime
  // Token embedded in QR — validated server-side, never decoded client-side
  qr_token        String        @unique @default(cuid())
  status          VisitorStatus @default(PRE_AUTHORIZED)
  created_at      DateTime      @default(now())

  created_by      User          @relation(fields: [created_by_id], references: [id])
  visitor_log     VisitorLog?

  @@index([qr_token])
  @@map("visitor_qr_codes")
}

// Full visitor log entry (for both QR and walk-in visitors)
model VisitorLog {
  id                    String        @id @default(cuid())
  conjunto_id           String
  unit_id               String
  qr_code_id            String?       @unique // Present if entry via QR
  visitor_name          String
  // cedula_encrypted: AES-256-GCM encrypted at app layer
  // Key stored in AWS Secrets Manager — never in DB
  cedula_encrypted      String?
  // Habeas Data: consent was shown and accepted by visitor at guard tablet
  habeas_data_accepted  Boolean       @default(false)
  status                VisitorStatus
  guard_user_id         String?       // Guard who logged the entry
  checked_in_at         DateTime?
  checked_out_at        DateTime?
  // Auto-purge: records deleted after 30 days (BullMQ scheduled job)
  purge_after           DateTime      @default(dbgenerated("NOW() + INTERVAL '30 days'"))

  conjunto              Conjunto      @relation(fields: [conjunto_id], references: [id])
  unit                  Unit          @relation(fields: [unit_id], references: [id])
  qr_code               VisitorQrCode? @relation(fields: [qr_code_id], references: [id])

  @@index([conjunto_id])
  @@index([unit_id])
  @@map("visitor_logs")
}

// Package/delivery tracking
model DeliveryLog {
  id                String   @id @default(cuid())
  conjunto_id       String
  unit_id           String
  carrier           String   // "rappi" | "mercadolibre" | "servientrega" | "other"
  tracking_number   String?
  description       String?
  // r2_key to the photo taken by guard (encrypted in R2)
  package_photo_key String?
  guard_user_id     String?
  received_at       DateTime @default(now())
  // Resident confirms pickup in-app
  picked_up_by_id   String?
  picked_up_at      DateTime?

  conjunto          Conjunto @relation(fields: [conjunto_id], references: [id])
  unit              Unit     @relation(fields: [unit_id], references: [id])

  @@index([conjunto_id])
  @@index([unit_id])
  @@map("delivery_logs")
}

// ─────────────────────────────────────────────
// COMPLIANCE & AUDIT
// ─────────────────────────────────────────────

model ConsentRecord {
  id            String   @id @default(cuid())
  conjunto_id   String
  user_id       String
  policy_version String  // e.g., "v2.1"
  accepted_at   DateTime @default(now())
  ip_address    String?
  user_agent    String?

  conjunto      Conjunto @relation(fields: [conjunto_id], references: [id])
  user          User     @relation(fields: [user_id], references: [id])

  @@map("consent_records")
}

// Immutable audit trail for sensitive operations
model AuditLog {
  id            String   @id @default(cuid())
  conjunto_id   String
  actor_id      String?  // NULL for system events
  action        String   // "document.accessed" | "payment.created" | "visitor.checkin"
  entity_type   String   // "Document" | "Payment" | "VisitorLog"
  entity_id     String
  metadata      Json?    // Additional context (IP, before/after state)
  created_at    DateTime @default(now())

  conjunto      Conjunto @relation(fields: [conjunto_id], references: [id])
  actor         User?    @relation(fields: [actor_id], references: [id])

  @@index([conjunto_id])
  @@index([entity_type, entity_id])
  @@map("audit_logs")
}
```

---

### Key Schema Design Decisions

**Coeficiente on the Vote record (snapshot pattern):** The coeficiente stored on `AsambleaVote` and `AsambleaAttendance` is a point-in-time snapshot taken at assembly start. This is legally required — if a unit is sold mid-year and coeficiente changes, old assembly records must reflect the value at the time of the vote.

**Lease document via UnitOccupancy:** The `lease_document_id` on `UnitOccupancy` creates the chain: Tenant → Occupancy → Document → R2 file. This means when you check if a user can access a lease, you query `UnitOccupancy` — a tenant can only access the lease tied to their own active occupancy record.

**Payment gateway_payload as Json:** Store the raw Wompi/ePayco webhook payload unmodified. This is your source of truth for disputes. Never derive payment status only from your own DB — always reconcile against this payload.

**cedula_encrypted on VisitorLog:** The raw cédula never enters the DB in plaintext. AES-256-GCM encryption happens in the NestJS service layer before `INSERT`. The DB stores ciphertext only. A court order or SAR to your company produces the ciphertext; only your application with the Secrets Manager key can decrypt.

**purge_after column on VisitorLog:** A PostgreSQL-native expression sets the retention window. A nightly BullMQ job runs `DELETE FROM visitor_logs WHERE purge_after < NOW()`. This is your Ley 1581 retention limiter.
