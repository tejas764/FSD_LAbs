import { Cross } from "lucide-react";

export function CrisisBrand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="crisis-brand">
      <span className="crisis-brand-mark">
        <Cross aria-hidden="true" strokeWidth={2.8} />
      </span>
      {!compact && (
        <span>
          <span className="crisis-brand-name">
            Crisis<span>Map</span>
          </span>
          <span className="crisis-brand-caption">Together. Prepared.</span>
        </span>
      )}
    </span>
  );
}
