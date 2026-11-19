"use client";

import { useTranslation } from "react-i18next";

// ─── damage level legend data ─────────────────────────────────────────────────

const LEGEND_ITEMS = [
  {
    level: "COMPLETE",
    color: "#ef4444",
    labelKey: "damage_complete",
  },
  {
    level: "PARTIAL",
    color: "#f59e0b",
    labelKey: "damage_partial",
  },
  {
    level: "MINIMAL",
    color: "#22c55e",
    labelKey: "damage_minimal",
  },
] as const;

// ─── component ────────────────────────────────────────────────────────────────

export function MapLegend() {
  const { t } = useTranslation();

  return (
    <div
      role="region"
      aria-label={t("reporter.map.legend_label")}
      className="flex flex-col gap-1 rounded-md border border-border bg-background/90 px-3 py-2 text-xs shadow-sm backdrop-blur-sm"
    >
      {LEGEND_ITEMS.map(({ level, color, labelKey }) => (
        <div key={level} className="flex items-center gap-2">
          {/* Colour swatch */}
          <svg
            aria-hidden="true"
            viewBox="0 0 20 28"
            width="12"
            height="16"
            xmlns="http://www.w3.org/2000/svg"
            role="img"
            className="shrink-0"
          >
            <path
              d="M10 1C5.03 1 1 5.03 1 10c0 7.5 9 17 9 17s9-9.5 9-17c0-4.97-4.03-9-9-9z"
              fill={color}
              stroke="white"
              strokeWidth="1.5"
            />
            <circle cx="10" cy="10" r="3" fill="rgba(255,255,255,0.5)" />
          </svg>
          <span className="text-foreground">{t(labelKey)}</span>
        </div>
      ))}
    </div>
  );
}
