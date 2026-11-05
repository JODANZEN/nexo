import { cn } from '@/lib/utils';

/**
 * NEXO wordmark + house "M" monogram. The navy half uses `currentColor` (so it
 * renders navy on light backgrounds and white in the navy sidebar) while the
 * teal half stays fixed — matching the light and dark brand versions.
 */
export function NexoLogo({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-2', className)}>
      <NexoMark className="h-8 w-8 shrink-0" />
      <span className="text-xl font-semibold tracking-[0.22em]">NEXO</span>
    </div>
  );
}

function NexoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 64" fill="none" className={className} aria-hidden>
      {/* Navy half: left wall + "\" roof slope (inherits currentColor) */}
      <path
        d="M10 56 L10 16 L34 42"
        stroke="currentColor"
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Teal half: "/" roof slope + right wall (crosses the navy slope) */}
      <path
        d="M26 42 L50 16 L50 56"
        className="stroke-nexo-teal"
        strokeWidth={5.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* 2×2 window grid, tucked under the crossing */}
      <g fill="currentColor">
        <rect x="24.25" y="43.75" width="4.5" height="4.5" rx="1.2" />
        <rect x="31.25" y="43.75" width="4.5" height="4.5" rx="1.2" />
        <rect x="24.25" y="50.75" width="4.5" height="4.5" rx="1.2" />
        <rect x="31.25" y="50.75" width="4.5" height="4.5" rx="1.2" />
      </g>
    </svg>
  );
}
