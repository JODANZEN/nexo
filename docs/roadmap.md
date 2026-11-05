# Nexo — Product Roadmap

## Current: Phase 9 — Enhanced Features
- Recurring payment intent (Wompi tokenized, auto-charge day 1)
- Parking module (spots, sessions, hourly billing)
- Contabilidad lite (CxC export, paz y salvo PDF, conciliación manual)
- Iris AI assistant (Groq llama-3.3-70b-versatile, RAG over conjunto data)

## Next: Phase 10 — Functional Audit & Deploy
- Full build + TypeScript check
- All smoke tests passing against Neon
- Missing UI stubs filled
- Env var audit
- Deploy: Railway (API) + Vercel (web) + Neon prod branch + R2 prod bucket

## Phase 11 — Production Hardening
- Wire real Wompi sandbox keys → test full payment flow end-to-end
- Wire R2 credentials → test document upload + presigned view
- Fix Upstash Redis URL (malformed) → wire real `rediss://` URL
- Configure Clerk dashboard: Sessions → Customize token to include conjuntoId/unitId/role from publicMetadata
- Set up production Neon branch + R2 prod bucket

## Phase 12 — Mobile Apps (React Native / Expo)

> **Note to future self:** After web is stable in production, scaffold the mobile app.

### Plan
- Scaffold `apps/mobile` as Expo React Native (currently stubbed, do NOT touch until web is live)
- Resident-facing only: mirrors `/portal` but native
  - Inicio (balance card, quick actions)
  - Pagos (PSE / Nequi via Wompi deep link)
  - Solicitudes (PQR list + create + detail)
  - Documentos (view presigned PDFs)
  - Visitas (QR code display for visitor pre-auth)
  - Iris chat
- Auth: Clerk Expo SDK (SMS OTP — same as web)
- Share `@nexo/types`, `@nexo/utils`, `@nexo/database` client from the monorepo
- Payments: Wompi mobile redirect (PSE opens bank app, Nequi opens Nequi app)

### App Store targets
- **Google Play Store** — Android APK via `eas build --platform android`
- **Apple App Store** — iOS via `eas build --platform ios` (requires Apple Developer account ~$99/year)
- Use **Expo Application Services (EAS)** for builds and OTA updates

### Prerequisites before starting mobile
1. Web app live on Vercel and stable for ≥ 2 weeks
2. At least 3 real conjuntos onboarded (real data to test against)
3. Wompi production keys obtained
4. Apple Developer account registered

## Phase 13 — Growth Features
- Iris AI v2: RAG over conjunto's internal documents (reglamento PH, actas, circulares)
- DIAN media magnéticos export (12 formats, Res. 227/2024) — for larger conjuntos
- Full PUC-based accounting module
- Recurring payment with Nequi/Daviplata auto-debit
- Predictive cartera model (identify mora risk 30-60 days early)
- Parqueaderos v2: ANPR/license plate recognition via camera
- Multi-conjunto admin view (for professional administradoras managing multiple conjuntos)

---
*Last updated: 2026-06-25*
