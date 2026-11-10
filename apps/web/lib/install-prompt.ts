'use client';

import { useSyncExternalStore } from 'react';

/** Chrome/Android's deferred install prompt (not in lib.dom). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

// Chrome fires `beforeinstallprompt` once, shortly after the first page load —
// usually on /sign-in, long before /portal or /tareas mount. So the listener is
// registered when this module loads (imported from app/providers.tsx) and the
// event is parked here until the banner needs it.
let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // keep Chrome's own mini-infobar from racing ours
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installed = true;
    emit();
  });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** `canPrompt` is true only where the browser offered a native install prompt. */
export function useInstallPrompt() {
  const canPrompt = useSyncExternalStore(subscribe, () => deferred !== null, () => false);
  const wasInstalled = useSyncExternalStore(subscribe, () => installed, () => false);

  async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
    const evt = deferred;
    if (!evt) return 'unavailable';
    deferred = null; // a prompt event can only be used once
    emit();
    try {
      await evt.prompt();
      return (await evt.userChoice).outcome;
    } catch {
      return 'unavailable';
    }
  }

  return { canPrompt, wasInstalled, promptInstall };
}
