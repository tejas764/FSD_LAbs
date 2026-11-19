"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";

import { useConnectivity } from "@/lib/offline/connectivity";

type BannerStatus = "offline" | "reconnecting" | "synced" | "failed";

export interface ConnectivityState {
  isOnline: boolean;
  pendingCount: number;
}

/**
 * Reads shared connectivity and queue state from the application provider,
 * and fires sonner toasts when connectivity status changes.
 * Returns { isOnline, pendingCount } for use by the host component.
 */
export function useConnectivityToast(): ConnectivityState {
  const { t } = useTranslation();
  const { isOnline, pendingCount, failedCount, syncing } = useConnectivity();

  const prevStatusRef = useRef<BannerStatus | null>(null);

  // Fire toasts on status transitions.
  const status: BannerStatus = !isOnline
    ? "offline"
    : failedCount > 0 ? "failed" : pendingCount > 0
      ? "reconnecting"
      : "synced";

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = status;
    if (prev === null || prev === status) return;
    if (status === "offline") {
      toast.warning(t("connectivity.offline_saved_locally", { count: pendingCount }), {
        id: "connectivity",
        duration: Infinity,
      });
    } else if (status === "reconnecting") {
      const message = syncing ? t("connectivity.reconnecting_uploading", { count: pendingCount }) : t("connectivity_mode.waiting", { count: pendingCount, defaultValue: "{{count}} records waiting" });
      toast.info(message, {
        id: "connectivity",
        duration: Infinity,
      });
    } else if (status === "failed") {
      toast.warning(t("connectivity_mode.failed", { defaultValue: "Some saved records need attention. Open the offline workspace to retry." }), { id: "connectivity", duration: 6000 });
    } else {
      toast.success(t("connectivity.all_synced"), {
        id: "connectivity",
        duration: 3000,
      });
    }
  }, [status, pendingCount, syncing, t]);

  return { isOnline, pendingCount };
}
