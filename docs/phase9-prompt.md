Read CLAUDE.md and docs/blueprint.md before doing anything.

We are on **Phase 9 — Enhanced Features**. Build all four modules in order, confirming each compiles before moving to the next.

---

## 9.1 — Recurring Payment Intent (Wompi tokenized)

Goal: resident saves a payment method once → system auto-charges them on day 1 of each billing month.

### Backend (`apps/api/src/payments/`)

1. Add `POST /payments/recurring/enroll`
   - Body: `{ unitId, paymentMethod: 'CARD' | 'NEQUI' | 'PSE' }`
   - Call Wompi's tokenization endpoint to create a payment source (`POST https://sandbox.wompi.co/v1/payment_sources`)
   - Store result in new `RecurringMandate` model (see schema below)
   - Guard: ClerkAuthGuard, user must own the unitId

2. Add `GET /payments/recurring/status?unitId=` → returns active mandate or null

3. Add `DELETE /payments/recurring/cancel` → sets mandate to CANCELLED

4. Add a BullMQ job queue `auto-charge` and a processor `AutoChargeProcessor`:
   - Job payload: `{ conjuntoId, billingMonth, billingYear }`
   - For each unit with an active mandate: calculate balance → if totalDue > 0 → charge via Wompi tokenized payment source → reconcile (reuse existing reconcile logic)
   - Idempotency: skip if a Payment already exists for this unit + billing period with method AUTO_CHARGE

5. Schedule the auto-charge job via a NestJS cron (`@Cron`) that fires on the 1st of each month at 06:00 COT (`America/Bogota`). Put the cron in a new `BillingCronService` inside `billing/billing-cron.service.ts`. Use `@nestjs/schedule` — install it.

### Schema addition (`packages/database/src/schema.prisma`)

Add this model:
```prisma
model RecurringMandate {
  id                String   @id @default(cuid())
  conjunto_id       String
  unit_id           String
  wompi_source_id   String   // Wompi payment source token
  payment_method    String   // CARD | NEQUI | PSE
  status            String   @default("ACTIVE") // ACTIVE | CANCELLED | FAILED
  created_at        DateTime @default(now())
  updated_at        DateTime @updatedAt

  conjunto  Conjunto @relation(fields: [conjunto_id], references: [id])
  unit      Unit     @relation(fields: [unit_id], references: [id])

  @@unique([unit_id, status])
  @@index([conjunto_id])
}
```

Run `npx prisma migrate dev --name add_recurring_mandate` after adding the model.

### Frontend (`apps/web/app/portal/pagos/page.tsx`)

Add a "Pago automático" section below the cartera table:
- If no active mandate: show a card with explanation + CTA button "Activar pago automático" → opens a small dialog to pick payment method (CARD / NEQUI) → calls `POST /payments/recurring/enroll`
- If active mandate: show green badge "Activo · [method]" + "Cancelar" link
- Use existing `useApi()` + TanStack Query pattern. No raw fetch().

---

## 9.2 — Parking Module

### Schema addition

Add to `schema.prisma`:
```prisma
model ParkingSpot {
  id            String   @id @default(cuid())
  conjunto_id   String
  spot_number   String
  spot_type     String   @default("VISITOR") // RESIDENT | VISITOR
  unit_id       String?  // assigned resident unit (null = visitor spot)
  created_at    DateTime @default(now())

  conjunto  Conjunto        @relation(fields: [conjunto_id], references: [id])
  unit      Unit?           @relation(fields: [unit_id], references: [id])
  sessions  ParkingSession[]

  @@unique([conjunto_id, spot_number])
  @@index([conjunto_id])
}

model ParkingSession {
  id            String    @id @default(cuid())
  conjunto_id   String
  spot_id       String
  license_plate String
  visitor_name  String?
  unit_visited  String?
  entered_at    DateTime  @default(now())
  exited_at     DateTime?
  amount_charged Decimal? @db.Decimal(12,2)

  conjunto Conjunto    @relation(fields: [conjunto_id], references: [id])
  spot     ParkingSpot @relation(fields: [spot_id], references: [id])

  @@index([conjunto_id])
  @@index([spot_id])
}
```

Run `npx prisma migrate dev --name add_parking`.

### Backend (`apps/api/src/parking/`)

Create `ParkingModule` with `ParkingController` + `ParkingService`:

- `GET /parking/spots` — list all spots for the conjunto (admin)
- `POST /parking/spots` — create spot (admin). Body: `{ spotNumber, spotType, unitId? }`
- `POST /parking/sessions/entry` — log vehicle entry. Body: `{ spotId, licensePlate, visitorName?, unitVisited? }`. Returns the session.
- `PATCH /parking/sessions/:id/exit` — log exit, calculate `amount_charged` based on duration. Use a simple flat rate from `Conjunto.parking_rate_per_hour` (add this field: `Decimal @default(3500)`). Duration = `(exitedAt - enteredAt)` in hours, rounded up. Use `Decimal.js`.
- `GET /parking/sessions` — list sessions (admin). Query params: `?spotId=` `?date=YYYY-MM-DD`
- `GET /parking/spots/available` — list spots with no active session (used by gate staff)

Add `parking_rate_per_hour Decimal @default(3500) @db.Decimal(12,2)` to the `Conjunto` model. Run migration.

### Frontend — Admin dashboard (`apps/web/app/dashboard/`)

Create `app/dashboard/porteria/parking/page.tsx` with `export const dynamic = 'force-dynamic'`:
- Table of active parking sessions (spot, plate, time in, elapsed, cost so far)
- "Registrar salida" button per row → calls PATCH exit
- "Nueva entrada" button → modal with spotId select + plate input
- Use TanStack Query, poll every 30s (`refetchInterval: 30_000`)

Add "Parqueaderos" nav item to the sidebar in `components/dashboard/sidebar.tsx` with the `ParkingSquare` icon from lucide-react, href `/dashboard/porteria/parking`.

---

## 9.3 — Contabilidad Lite

### Backend (`apps/api/src/contabilidad/`)

Create `ContabilidadModule` with `ContabilidadController` + `ContabilidadService`:

1. `GET /contabilidad/cuentas-por-cobrar` — returns all unpaid Charges for the conjunto with unit info. Response shape:
```ts
{
  unitNumber: string;
  residentName: string | null;
  periodLabel: string;
  baseAmount: number;
  paidAmount: number;
  outstanding: number;
  daysLate: number;
  phase: 'PRONTO_PAGO' | 'TARIFA_PLENA' | 'MORA';
}[]
```

2. `GET /contabilidad/paz-y-salvo/:unitId` — generates a PDF using `@react-pdf/renderer` (React.createElement, NO JSX):
   - Title: "Certificado de Paz y Salvo"
   - Conjunto name, unit number, resident name
   - Confirmation that the unit has no outstanding charges as of today (COT)
   - If the unit HAS outstanding charges: return 400 with `{ error: 'Unit has outstanding balance', totalDue: <amount> }`
   - Set response header `Content-Type: application/pdf`, stream the PDF buffer

3. `POST /contabilidad/conciliacion` — upload a bank statement for manual reconciliation.
   - Accepts multipart/form-data with field `statement` (CSV or XLSX file, max 5MB)
   - Parse CSV rows: `[date, description, amount, reference]`
   - For each row that matches a Payment.wompi_reference → mark the payment status as RECONCILED (add `reconciled_at DateTime?` to Payment model)
   - Return: `{ matched: number, unmatched: number, rows: [...] }`
   - Use `multer` for file upload — install `@nestjs/platform-express` multer types if not present

4. `GET /contabilidad/reporte-mora` — returns mora summary: total units in mora, total COP owed in mora fees, list of top 10 by amount.

Run `npx prisma migrate dev --name add_conciliacion` after adding `reconciled_at` to Payment.

### Frontend — Admin dashboard (`apps/web/app/dashboard/contabilidad/`)

Create `page.tsx` (force-dynamic) with three tabs: **Cartera**, **Paz y Salvo**, **Conciliación**.

- **Cartera tab**: table from `/contabilidad/cuentas-por-cobrar`. Columns: Unidad, Residente, Periodo, Cuota, Pagado, Pendiente, Días mora. Color-code rows (green=al día, yellow=tarifa plena, red=mora). Export CSV button (generate client-side from the data array).
- **Paz y Salvo tab**: unit number autocomplete input → "Generar PDF" button → `window.open('/api/contabilidad/paz-y-salvo/${unitId}')` to download. Show error toast if unit has balance.
- **Conciliación tab**: file drag-drop input (CSV only) → upload to `POST /contabilidad/conciliacion` → show results table (matched / unmatched rows).

Add "Contabilidad" to sidebar with `BookOpen` icon, href `/dashboard/contabilidad`.

---

## 9.4 — Iris AI (Groq)

Use Groq's free API (model: `llama-3.3-70b-versatile`). Install `groq-sdk`. Add `GROQ_API_KEY` to `.env.example`.

### Backend (`apps/api/src/iris/`)

Create `IrisModule` with `IrisController` + `IrisService`.

`POST /iris/chat`
- Body: `{ message: string, history?: { role: 'user' | 'assistant', content: string }[] }`
- Guard: ClerkAuthGuard
- In `IrisService.chat(conjuntoId, message, history)`:
  1. Gather context from DB (all within the user's conjuntoId):
     - Last 30 days PQRs (title, status, category)
     - Current month billing summary (total charged, total collected, % mora)
     - Last 5 visitor log entries (name only, no cédula — Habeas Data)
     - Conjunto name + unit count
  2. Build a system prompt:
  ```
  Eres Iris, la asistente virtual de [Conjunto name]. 
  Tienes acceso a datos reales del conjunto. Responde siempre en español, 
  de forma concisa y profesional. No inventes datos que no estén en el contexto.
  
  CONTEXTO ACTUAL (${new Date().toLocaleDateString('es-CO')}):
  - Unidades: ${unitCount}
  - PQRs abiertas: ${openPqrCount} (últimas: ${recentPqrsSummary})
  - Recaudo mes: ${collected} / ${totalCharged} (${pct}% recaudado)
  - En mora: ${inMoraCount} unidades
  - Últimas visitas: ${recentVisitorNames}
  ```
  3. Call Groq: `groq.chat.completions.create({ model: 'llama-3.3-70b-versatile', messages: [systemMessage, ...history, userMessage], max_tokens: 512 })`
  4. Return `{ reply: string }`

`GET /iris/suggestions` — returns 4 hardcoded suggestion strings in Spanish based on what's in the DB (e.g. if mora > 10% return "¿Cuántas unidades están en mora este mes?")

### Frontend — Admin dashboard (`apps/web/app/dashboard/iris/page.tsx`)

Chat UI (force-dynamic):
- Full-height column, messages scroll area, input at bottom
- Renders assistant messages with a teal "Iris" avatar dot, user messages right-aligned
- On load: fetch `/iris/suggestions` and show as chips the user can click
- Sends history with each message for multi-turn context
- Loading state: animated "Iris está escribiendo..." with three bouncing dots

Add "Iris IA" to sidebar with `Sparkles` icon from lucide-react, href `/dashboard/iris`.

---

## After all 4 modules

1. Run `npm run build` from the repo root. Fix any TypeScript errors before finishing.
2. Confirm `apps/api` compiles: `cd apps/api && npx tsc --noEmit`
3. Add the new env vars to `.env.example`: `GROQ_API_KEY=`, `WOMPI_RECURRING_SECRET=`

Do not scaffold apps/mobile. Do not modify the existing smoke test files.
