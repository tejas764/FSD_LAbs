"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { RefreshCw, Wifi, WifiOff } from "lucide-react";
import { useConnectivity } from "@/lib/offline/connectivity";

export function ConnectivityControls() {
  const { t } = useTranslation();
  const connection = useConnectivity();
  const pathname = usePathname();
  const router = useRouter();
  const staysOnPage = pathname.startsWith("/volunteer") || pathname === "/ai-logs" || pathname.startsWith("/dashboard/volunteers");
  useEffect(() => {
    if (!connection.ready) return;
    // Preserve an in-progress form or the chosen workspace across connectivity changes.
    if (!connection.isOnline && !staysOnPage && !["/offline", "/report", "/report/success", "/my-reports", "/preparedness", "/resources"].includes(pathname)) router.replace("/offline");
  }, [connection.ready, connection.isOnline, pathname, router, staysOnPage]);
  useEffect(() => {
    if (connection.ready && connection.isOnline) { router.prefetch("/offline"); router.prefetch("/report"); router.prefetch("/my-reports"); router.prefetch("/preparedness"); router.prefetch("/resources"); }
  }, [connection.ready, connection.isOnline, router]);

  function toggle() {
    const next = connection.isOnline ? "offline" : "online";
    connection.setPreference(next);
    if (next === "offline" && !staysOnPage && !pathname.startsWith("/report") && !["/my-reports", "/preparedness", "/resources"].includes(pathname)) router.push("/offline");
    if (next === "online" && pathname === "/offline" && navigator.onLine) router.push("/");
  }
  return <div className="flex items-center gap-1">
    <button type="button" role="switch" aria-checked={connection.isOnline}
      aria-label={t("connectivity_mode.toggle", { defaultValue: "Online mode" })} onClick={toggle}
      className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-2 text-xs font-medium hover:bg-app-header-foreground/10 focus-visible:outline-2 focus-visible:outline-offset-2">
      {connection.isOnline ? <Wifi aria-hidden="true" className="size-4 text-green-400" /> : <WifiOff aria-hidden="true" className="size-4 text-amber-400" />}
      <span>{connection.isOnline ? t("connectivity_mode.online", { defaultValue: "Online" }) : t("connectivity_mode.offline", { defaultValue: "Offline" })}</span>
      <span aria-hidden="true" className={`relative h-4 w-7 rounded-full ${connection.isOnline ? "bg-green-600" : "bg-amber-600"}`}><span className={`absolute top-0.5 size-3 rounded-full bg-white transition-all ${connection.isOnline ? "start-3.5" : "start-0.5"}`} /></span>
    </button>
    {(connection.pendingCount > 0 || connection.failedCount > 0 || connection.syncing) && <button type="button"
      disabled={!connection.isOnline || connection.syncing} onClick={() => { void connection.syncNow(); }}
      aria-label={t("connectivity_mode.sync", { defaultValue: "Sync saved data" })}
      title={t("connectivity_mode.waiting", { defaultValue: "{{count}} records waiting", count: connection.pendingCount + connection.failedCount })}
      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2 text-xs hover:bg-app-header-foreground/10 disabled:opacity-60">
      <RefreshCw aria-hidden="true" className={`size-3.5 ${connection.syncing ? "animate-spin" : ""}`} />{connection.pendingCount + connection.failedCount}
    </button>}
  </div>;
}
