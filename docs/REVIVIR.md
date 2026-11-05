# Revivir Nexo — checklist

*Actualizado: 2026-09-12. Última actividad real del proyecto: julio 2026.*

---

## URLs

| Servicio | URL | Estado |
|---|---|---|
| **Web (Vercel)** | https://nexo-psi-brown.vercel.app | 🟡 Probablemente vivo — Vercel free no expira |
| **API (Railway)** | https://nexo-production-cd1f.up.railway.app | 🔴 Muerto (se acabó el crédito de $5) |
| Railway dashboard | https://railway.com/project/b54702c1-497b-465f-8347-a187a92e2685 | — |
| Vercel dashboard | https://vercel.com/joses-projects-0892e045/nexo | — |

> ⚠️ Usa siempre el alias `nexo-psi-brown.vercel.app`, nunca las URLs por-deploy (`nexo-<hash>.vercel.app`). El CORS del API está configurado para el alias.

---

## Qué pasó

Railway se quedó sin crédito (el plan trial da $5 y se consumió). Cuando el API muere:

- La web **sí carga** (Vercel sirve el frontend estático)
- El login **sí funciona** (Clerk es un servicio aparte)
- Pero **todo lo demás falla** — cada llamada al API da error de red, así que el dashboard sale vacío con los mensajes de error que construimos en Phase 11.4

O sea: la web se ve pero no sirve. Todo depende de revivir Railway.

---

## Para revivir — en orden

### 1. Railway (lo único que está muerto)

1. Entra a https://railway.com/project/b54702c1-497b-465f-8347-a187a92e2685
2. Agrega método de pago → plan **Hobby ($5/mes)**
3. Verifica que las **12 variables** sigan ahí (Variables tab):
   ```
   APP_URL, CF_ACCOUNT_ID, CLERK_PUBLISHABLE_KEY, CLERK_SECRET_KEY,
   DATABASE_URL, ENCRYPTION_KEY, GROQ_API_KEY, R2_ACCESS_KEY_ID,
   R2_BUCKET_NAME, R2_SECRET_ACCESS_KEY, REDIS_URL, VOTE_SECRET
   ```
   Railway suele conservarlas aunque el servicio esté dormido. Si se borraron, están en tu `.env` local.
4. Redeploy: desde el dashboard (botón Redeploy) o desde terminal en la raíz del repo:
   ```
   railway up
   ```
5. Verifica:
   ```
   curl https://nexo-production-cd1f.up.railway.app/api/health
   ```
   Debe responder `{"status":"ok","db":"connected","timestamp":"..."}`

### 2. Neon (revisar — puede estar dormido)

Neon suspende branches sin actividad pero **no borra datos** en free tier. La primera query lo despierta (tarda ~3s).

- Si el health check dice `db:"connected"` → todo bien
- Si Neon borró el proyecto por inactividad extendida, hay que recrear y correr:
  ```
  cd packages/database
  npx prisma migrate deploy
  ```
  ⚠️ **NO corras `db:seed` contra la DB que ya tiene datos** — borra filas y regenera IDs, lo que rompe el `publicMetadata` de Clerk (los conjuntoId/unitId apuntarían a filas muertas). Si pasa, usa `apps/api/src/scripts/bootstrap-admin.ts` para repuntar.

### 3. Upstash Redis (revisar)

Free tier = 500k requests/mes. Si se pasó el límite o la DB se borró por inactividad, crea una nueva y actualiza `REDIS_URL` en Railway.

Las colas de BullMQ ya están en modo low-poll (`LAZY_WORKER_OPTS`) para no quemar el límite.

### 4. Vercel (probablemente no hay que tocar)

Solo verifica que `NEXT_PUBLIC_API_URL` siga apuntando al Railway URL:
- Vercel dashboard → nexo → Settings → Environment Variables

Si cambió el dominio de Railway, actualízalo y redeploy:
```
vercel --prod --yes
```

### 5. Clerk (revisar el session token)

Esto es lo que hace que el JWT lleve `conjuntoId`/`unitId`/`role`. Sin esto todo da 401.

- dashboard.clerk.com → tu app → Configure → Sessions → Customize session token
- Debe tener: `{ "publicMetadata": "{{user.public_metadata}}" }`

---

## Costo para mantenerlo vivo

| Servicio | Costo |
|---|---|
| Railway Hobby | $5/mes |
| Vercel Hobby | $0 |
| Neon free | $0 |
| Upstash free | $0 |
| Clerk free | $0 (hasta 10k MAU) |
| Cloudflare R2 | $0 (hasta 10GB) |
| Groq | $0 (free tier) |
| **Total** | **$5/mes** |

---

## Deploy model (para cuando sigas trabajando)

- Cambios de **frontend** → `vercel --prod --yes` (desde la raíz del repo)
- Cambios de **backend** → `railway up` (desde la raíz del repo)
- Claude puede correr Vercel pero **no** Railway (login interactivo) — ese lo corres tú

---

## Dónde estaba el proyecto

Fases 1–12 completas + Phase 14 (entitlements) scaffolded. Ver `CLAUDE.md` para el estado detallado.

**Lo siguiente que seguía:** City U design-partner track — Phase 17 (Fast-Ticket Loop con SLA timers), 18 (RoomType + timeline), 19 (integraciones Twilio/HubSpot/Siigo/DocuSign). Ver `docs/cityu-integration-plan.md`.

**Diferido:** Wompi live (Phase 13), Contabilidad Completo (15), DIAN (16).
