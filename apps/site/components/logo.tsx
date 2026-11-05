// Placeholder wordmark. Swap for apps/web/components/nexo-logo.tsx to match the app exactly.
export default function Logo({ inverted = false }: { inverted?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <rect x="2" y="2" width="15" height="15" rx="4.5" fill={inverted ? "#FFFFFF" : "#0F2A44"} />
        <rect x="11" y="11" width="15" height="15" rx="4.5" fill="#0E9F8E" fillOpacity="0.92" />
      </svg>
      <span className={`text-[1.35rem] font-semibold tracking-tight ${inverted ? "text-white" : "text-navy"}`}>
        nexo
      </span>
    </span>
  );
}
