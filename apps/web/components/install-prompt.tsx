'use client';

import { useEffect, useState } from 'react';
import { Share, SquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useInstallPrompt } from '@/lib/install-prompt';
import { cn } from '@/lib/utils';

const DISMISS_KEY = 'nexo:install-dismissed';

function wasDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) !== null;
  } catch {
    return false; // private mode / storage blocked: just show it this visit
  }
}

function isStandalone(): boolean {
  try {
    return (
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    );
  } catch {
    return false;
  }
}

/** iPhone/iPad (iPadOS reports itself as a Mac with a touch screen). */
function isIos(): boolean {
  const ua = navigator.userAgent;
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Small dismissible "install Nexo" card for the phone-first areas (/portal, /tareas).
 * Android/Chrome: real install button via `beforeinstallprompt`. iPhone: Safari has
 * no install API, so we show the two taps. Hidden once installed or dismissed.
 */
export function InstallPrompt({ className }: { className?: string }) {
  const { canPrompt, wasInstalled, promptInstall } = useInstallPrompt();
  // null until mounted: everything below depends on the device, so render nothing on the server.
  const [mode, setMode] = useState<null | 'hidden' | 'ios' | 'other'>(null);

  useEffect(() => {
    if (isStandalone() || wasDismissed()) setMode('hidden');
    else setMode(isIos() ? 'ios' : 'other');
  }, []);

  function dismiss() {
    setMode('hidden');
    try {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage unavailable: it stays hidden for this visit only */
    }
  }

  async function install() {
    const outcome = await promptInstall();
    // Saying "no" to the browser's dialog counts as closing our card too.
    if (outcome === 'dismissed') dismiss();
    else setMode('hidden');
  }

  if (mode === null || mode === 'hidden' || wasInstalled) return null;
  if (mode === 'other' && !canPrompt) return null;

  return (
    <section
      aria-label="Instalar Nexo"
      className={cn('flex items-center gap-3 rounded-xl border border-nexo-border bg-nexo-surface p-3 shadow-sm', className)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icons/icon-192.png" alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-[10px]" />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-nexo-text">Instala Nexo en tu celular</p>
        {mode === 'ios' ? (
          <p className="mt-0.5 text-xs leading-relaxed text-nexo-muted">
            Toca Compartir <Share className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden /> y luego «Agregar a
            inicio» <SquarePlus className="inline h-3.5 w-3.5 align-[-2px]" aria-hidden />.
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-nexo-muted">Ábrela desde tu pantalla de inicio, como cualquier app.</p>
        )}
      </div>
      {mode === 'other' ? (
        <Button variant="accent" size="sm" className="shrink-0" onClick={install}>
          Instalar
        </Button>
      ) : null}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Cerrar"
        className="-mr-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-nexo-faint hover:bg-nexo-bg hover:text-nexo-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nexo-teal"
      >
        <X className="h-4 w-4" />
      </button>
    </section>
  );
}
