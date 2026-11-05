# apps/site — Nexo marketing website

Public site for Nexo: product, pricing (Básico / Pro / Premium by unit range), a section for large operators, FAQ and a "book a demo" form. Spanish at `/es`, English at `/en`; `/` redirects based on the browser language.

Separate from `apps/web` (the product) so it can live on the main domain (e.g. `nexo.co`) while the app lives at `app.nexo.co`.

## Run locally

```bash
npm install            # from the repo root (workspaces pick up apps/site)
npm run dev -w @nexo/site   # http://localhost:3002
```

Without `RESEND_API_KEY`, the contact form logs leads to the terminal in dev.

## Environment (`apps/site/.env.local`, and in Vercel)

| Var | What |
|---|---|
| `RESEND_API_KEY` | Resend key (resend.com, free tier is enough) |
| `CONTACT_TO` | Who gets leads, comma-separated (you + Isa) |
| `CONTACT_FROM` | Sender on a domain verified in Resend. For testing: `Nexo <onboarding@resend.dev>` |
| `NEXT_PUBLIC_APP_URL` | Where "Ingresar" goes. Defaults to the current Vercel app |
| `NEXT_PUBLIC_CONTACT_EMAIL` | Optional. Shows "write to us directly" next to the form |

## Deploy on Vercel

New Vercel project → same repo → **Root Directory: `apps/site`** → add the env vars → deploy. Then point the domain at it.

## Where things are

- `content/es.ts`, `content/en.ts` — all copy. Edit text here, not in components.
- `lib/pricing.ts` — prices per unit range + annual discount (15%).
- `app/api/contact/route.ts` — form endpoint (validation, honeypot, Resend).
- `components/logo.tsx` — placeholder mark; swap for `apps/web/components/nexo-logo.tsx`.
- `tailwind.config.ts` — brand colors (navy/teal). Match to `apps/web` if they differ.

## Not done yet

- Política de tratamiento de datos page (needed in Colombia when you collect personal data; link it from the form + footer).
- Real logo, favicon and Open Graph image.
- Domain + Resend domain verification.
