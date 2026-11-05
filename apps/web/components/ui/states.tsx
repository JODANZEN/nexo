import type { ReactNode } from 'react';

// Shared loading / error / empty states (Phase 11.4/11.6). Keeps the same
// look across every dashboard + portal page without repeating the markup.

export function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-8 w-full animate-pulse rounded bg-nexo-border" />
      ))}
    </div>
  );
}

export function ErrorState({ error }: { error: unknown }) {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
      Error al cargar datos. {message}
    </div>
  );
}

export function EmptyState({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 p-8 text-center text-sm text-nexo-muted">
      {icon}
      <span>{children}</span>
    </div>
  );
}
