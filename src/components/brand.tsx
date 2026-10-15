import { cn } from "@/lib/utils";
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 64 64"
      fill="none"
      className={cn("brand-mark", className)}
    >
      <rect
        x="10"
        y="10"
        width="44"
        height="44"
        rx="12"
        stroke="currentColor"
        strokeWidth="5"
      />
      <path
        d="m26 28 7-6v22m-7 0h14"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="square"
        strokeLinejoin="miter"
      />
    </svg>
  );
}
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="brand">
      <span className="brand-icon">
        <BrandMark />
      </span>
      <span>
        <span className="brand-name">
          One <strong>ODC</strong>
        </span>
        {!compact && (
          <span className="brand-endorsement">OPULENCE DESIGN CONCEPT</span>
        )}
      </span>
    </div>
  );
}
