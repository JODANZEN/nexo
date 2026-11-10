'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import QRCode from 'qrcode';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Printer } from 'lucide-react';
import { inviteSignInUrl } from '@nexo/types';
import { useApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Skeleton, ErrorState } from '@/components/ui/states';
import type { InviteSettings } from '@/components/dashboard/invites';

const STEPS = [
  { title: 'Escanea', text: 'Abre la cámara de tu celular y apunta al código.' },
  { title: 'Entra con tu celular', text: 'Escribe el número que registraste en la residencia.' },
  { title: 'Escribe el código', text: 'Te llega por SMS en unos segundos.' },
];

// Only the poster reaches the paper: everything else in the dashboard shell
// (sidebar, topbar, bottom nav) is hidden, without touching those components.
const PRINT_CSS = `
@media print {
  @page { size: letter portrait; margin: 12mm; }
  html, body { background: #fff !important; }
  /* Dashboard shell out of the flow (so it adds no blank pages)… */
  body aside, body header, body nav, .afiche-controles { display: none !important; }
  main { padding: 0 !important; }
  /* …and anything left around the poster invisible. */
  body * { visibility: hidden !important; }
  #afiche, #afiche * { visibility: visible !important; }
  #afiche {
    width: 100%; break-inside: avoid;
    margin: 0 !important; border: 0 !important; box-shadow: none !important;
    -webkit-print-color-adjust: exact; print-color-adjust: exact;
  }
}`;

export default function AfichePage() {
  const api = useApi();
  const settings = useQuery({
    queryKey: ['invites', 'settings'],
    queryFn: () => api.get<InviteSettings>('/invites/settings'),
  });
  const [url, setUrl] = useState('');
  const [qr, setQr] = useState<string | null>(null);

  useEffect(() => {
    const target = inviteSignInUrl(window.location.origin);
    setUrl(target);
    // Rendered large so it stays sharp on paper; high error correction survives a worn print.
    QRCode.toDataURL(target, { width: 900, margin: 1, errorCorrectionLevel: 'H' })
      .then(setQr)
      .catch(() => setQr(null));
  }, []);

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <style>{PRINT_CSS}</style>

      <div className="afiche-controles flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/dashboard/propiedades" className="inline-flex items-center gap-1 text-xs text-nexo-muted hover:text-nexo-text">
            <ArrowLeft className="h-3.5 w-3.5" /> Propiedades
          </Link>
          <h1 className="mt-1 text-2xl font-bold tracking-tight">Afiche para la recepción</h1>
          <p className="mt-1 text-sm text-nexo-muted">
            Imprímelo y pégalo en la recepción: quien ya esté invitado escanea y entra con su celular.
          </p>
        </div>
        <Button variant="accent" onClick={() => window.print()} disabled={!qr || !settings.data}>
          <Printer className="h-4 w-4" /> Imprimir
        </Button>
      </div>

      {settings.isLoading ? (
        <Skeleton rows={8} />
      ) : settings.isError ? (
        <ErrorState error={settings.error} />
      ) : (
        <section
          id="afiche"
          className="flex flex-col items-center rounded-2xl border border-nexo-border bg-white px-8 py-10 text-center text-nexo-navy"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-nexo-teal">Nexo</p>
          <h2 className="mt-2 text-4xl font-bold leading-tight tracking-tight">{settings.data?.conjuntoName}</h2>
          <p className="mt-3 text-lg">Pagos, solicitudes y visitas desde tu celular.</p>

          {qr ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt={`Código QR para entrar a ${url}`} className="mt-8 h-auto w-full max-w-[22rem]" />
          ) : (
            <div className="mt-8 aspect-square w-full max-w-[22rem] animate-pulse rounded-xl bg-nexo-border" />
          )}
          <p className="mt-3 break-all font-mono text-sm text-nexo-muted">{url.replace(/^https?:\/\//, '')}</p>

          <ol className="mt-8 grid w-full gap-4 text-left sm:grid-cols-3 print:grid-cols-3">
            {STEPS.map((s, i) => (
              <li key={s.title} className="rounded-xl border border-nexo-border p-4">
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-nexo-navy text-base font-bold text-white">
                  {i + 1}
                </span>
                <p className="mt-3 text-base font-semibold leading-snug">{s.title}</p>
                <p className="mt-1 text-sm text-nexo-muted">{s.text}</p>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-sm text-nexo-muted">
            ¿No puedes entrar? Pide en recepción que registren tu número de celular.
          </p>
        </section>
      )}
    </div>
  );
}
