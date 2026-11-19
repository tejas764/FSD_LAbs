"use client";

import { useEffect, useState } from "react";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  CloudOff,
  CloudUpload,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type SyncStatusState =
  | "local"
  | "queued"
  | "syncing"
  | "synced"
  | "failed";

interface SyncStatusProps {
  status: SyncStatusState;
  size?: "sm" | "md";
  className?: string;
}

function usePrefersReducedMotion(): boolean {
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(false);

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setPrefersReducedMotion(mediaQuery.matches);

    onChange();
    mediaQuery.addEventListener("change", onChange);

    return () => {
      mediaQuery.removeEventListener("change", onChange);
    };
  }, []);

  return prefersReducedMotion;
}

export function SyncStatus({
  status,
  size = "sm",
  className,
}: SyncStatusProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();

  const sizeClass = size === "md" ? "text-sm" : "text-xs";
  const iconSizeClass = size === "md" ? "h-4 w-4" : "h-3.5 w-3.5";

  const stateProps = {
    local: {
      label: t("sync.saved_locally"),
      toneClass: "text-muted-foreground",
      ariaLive: "polite" as const,
      icon: <CloudOff aria-hidden="true" className={iconSizeClass} />,
    },
    queued: {
      label: t("sync.queued"),
      toneClass: "text-warning",
      icon: <Clock aria-hidden="true" className={iconSizeClass} />,
    },
    syncing: {
      label: t("sync.syncing"),
      toneClass: "text-info",
      ariaBusy: true,
      icon: reducedMotion ? (
        <CloudUpload
          aria-hidden="true"
          className={iconSizeClass}
          data-testid="sync-status-icon-cloud-upload"
        />
      ) : (
        <Loader2
          aria-hidden="true"
          className={cn(iconSizeClass, "animate-spin")}
          data-testid="sync-status-icon-loader"
        />
      ),
    },
    synced: {
      label: t("sync.synced"),
      toneClass: "text-success",
      ariaLive: "polite" as const,
      icon: <CheckCircle aria-hidden="true" className={iconSizeClass} />,
    },
    failed: {
      label: t("sync.failed"),
      toneClass: "text-destructive",
      role: "alert" as const,
      icon: <AlertTriangle aria-hidden="true" className={iconSizeClass} />,
    },
  }[status];

  return (
    <span
      aria-busy={stateProps.ariaBusy}
      aria-live={stateProps.ariaLive}
      className={cn(
        "inline-flex items-center gap-1.5",
        sizeClass,
        stateProps.toneClass,
        className,
      )}
      role={stateProps.role}
    >
      {stateProps.icon}
      <span>{stateProps.label}</span>
    </span>
  );
}
