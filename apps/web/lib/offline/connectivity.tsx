"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { apiClient } from "@/lib/api/client";
import { listAll } from "./queue";
import { listFieldMessages, syncFieldMessages, FIELD_DATA_EVENT } from "./field-store";
import { registerServiceWorker } from "./register";
import { syncQueue } from "./sync";
import { DATA_CHANGE_EVENT, getModePreference, isOfflineMode, MODE_CHANGE_EVENT, MODE_STORAGE_KEY, setApiReachable, setModePreference, type ModePreference } from "./mode";

interface Connectivity {
  isOnline: boolean; mode: ModePreference; preference: ModePreference; ready: boolean;
  syncing: boolean; pendingCount: number; failedCount: number; lastSync: string | null;
  error: string | null; offlineReady: boolean;
  setPreference: (mode: ModePreference) => void; syncNow: () => Promise<void>;
}
const fallback: Connectivity = {
  isOnline: true, mode: "online", preference: "online", ready: false, syncing: false,
  pendingCount: 0, failedCount: 0, lastSync: null, error: null, offlineReady: false,
  setPreference: setModePreference, syncNow: async () => {},
};
const Context = createContext<Connectivity | null>(null);
function subscribeMode(listener: () => void) {
  window.addEventListener(MODE_CHANGE_EVENT, listener);
  window.addEventListener("online", listener);
  window.addEventListener("offline", listener);
  return () => { window.removeEventListener(MODE_CHANGE_EVENT, listener); window.removeEventListener("online", listener); window.removeEventListener("offline", listener); };
}
export function useConnectivity(): Connectivity {
  const context = useContext(Context);
  const offline = useSyncExternalStore(subscribeMode, isOfflineMode, () => false);
  return context ?? { ...fallback, isOnline: !offline, mode: offline ? "offline" : "online" };
}

export function ConnectivityProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ isOnline: true, preference: "online" as ModePreference, ready: false,
    syncing: false, pendingCount: 0, failedCount: 0, lastSync: null as string | null, error: null as string | null, offlineReady: false });
  const running = useRef<Promise<void> | null>(null);
  const alive = useRef(false);
  const notifyMode = useCallback(() => {
    const offline = isOfflineMode();
    if (alive.current) setState((prev) => ({ ...prev, ready: true, preference: getModePreference(), isOnline: !offline }));
    navigator.serviceWorker?.controller?.postMessage({ type: "SET_MODE", offline });
    navigator.serviceWorker?.controller?.postMessage({ type: "CHECK_OFFLINE_READY" });
  }, []);
  const refreshCounts = useCallback(async () => {
    try {
      const [reports, messages] = await Promise.all([listAll(), listFieldMessages()]);
      const pendingCount = reports.filter((r) => ["queued", "syncing"].includes(r.status)).length + messages.filter((m) => m.status === "queued").length;
      const failedCount = reports.filter((r) => r.status === "failed").length + messages.filter((m) => m.status === "failed").length;
      if (alive.current) setState((prev) => ({ ...prev, pendingCount, failedCount }));
    } catch {
      if (alive.current) setState((prev) => ({ ...prev, error: "storage_unavailable" }));
    }
  }, []);
  const synchronize = useCallback((force = false): Promise<void> => {
    if (running.current) return running.current;
    if (isOfflineMode()) return Promise.resolve();
    const run = async () => {
      if (alive.current) setState((prev) => ({ ...prev, syncing: true, error: null }));
      try {
        const reports = await syncQueue(undefined, undefined, { force });
        const messages = !isOfflineMode() ? await syncFieldMessages(undefined, force) : undefined;
        if (reports.failed > 0 || (messages?.failed ?? 0) > 0) {
          if (alive.current) setState((prev) => ({ ...prev, error: "sync_unavailable" }));
        }
        if (!isOfflineMode() && alive.current && (reports.succeeded > 0 || messages?.uploaded || messages?.downloaded)) {
          const lastSync = new Date().toISOString();
          try { localStorage.setItem("crisismap:last-sync", lastSync); } catch { /* Optional display metadata. */ }
          setState((prev) => ({ ...prev, lastSync }));
        }
      } catch {
        if (alive.current) setState((prev) => ({ ...prev, error: "sync_unavailable" }));
      } finally {
        await refreshCounts();
        if (alive.current) setState((prev) => ({ ...prev, syncing: false }));
      }
    };
    running.current = run().finally(() => { running.current = null; });
    return running.current;
  }, [refreshCounts]);

  useEffect(() => {
    alive.current = true;
    let probing = false;
    let dataTimer: ReturnType<typeof setTimeout> | undefined;
    const probe = async () => {
      if (probing || document.visibilityState === "hidden") return;
      if (getModePreference() === "offline" || navigator.onLine === false) { notifyMode(); return; }
      probing = true;
      try {
        const response = await fetch("/api/v1/health", { cache: "no-store", signal: AbortSignal.timeout(5000) });
        setApiReachable(response.ok);
        notifyMode();
        if (response.ok) {
          await synchronize();
          // Prime reference metadata for offline report creation. No fake fallback crises.
          void apiClient.crises.list(true).catch(() => {});
        }
      } catch { setApiReachable(false); notifyMode(); }
      finally { probing = false; }
    };
    const onMode = () => { notifyMode(); void refreshCounts(); if (getModePreference() === "online" && navigator.onLine && !probing) void probe(); };
    const onData = () => {
      clearTimeout(dataTimer);
      dataTimer = setTimeout(() => {
        void (async () => {
          // A report may be saved after a drain took its initial snapshot. Run one
          // coalesced follow-up after that drain, instead of losing the notification.
          if (running.current) await running.current;
          if (!alive.current) return;
          await refreshCounts();
          await synchronize();
        })().catch(() => {});
      }, 80);
    };
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DATA_CHANGE_EVENT) : undefined;
    channel?.addEventListener("message", onData);
    const onStorage = (event: StorageEvent) => {
      if (event.key === MODE_STORAGE_KEY) { onMode(); void probe(); }
      if (event.key === DATA_CHANGE_EVENT || event.key === FIELD_DATA_EVENT) onData();
    };
    const onReady = () => { if (alive.current) setState((prev) => ({ ...prev, offlineReady: true })); };
    const onWorkerMessage = (event: MessageEvent<{ type?: string; ready?: boolean }>) => {
      if (event.data?.type === "OFFLINE_READY" && event.data.ready) onReady();
      if (event.data?.type === "SYNC_QUEUE") void synchronize();
    };
    window.addEventListener(MODE_CHANGE_EVENT, onMode);
    window.addEventListener(DATA_CHANGE_EVENT, onData);
    window.addEventListener("storage", onStorage);
    window.addEventListener("online", probe);
    window.addEventListener("offline", onMode);
    window.addEventListener("crisismap:offline-ready", onReady);
    document.addEventListener("visibilitychange", probe);
    navigator.serviceWorker?.addEventListener("controllerchange", notifyMode);
    navigator.serviceWorker?.addEventListener("message", onWorkerMessage);
    registerServiceWorker();
    notifyMode();
    void refreshCounts();
    try { const value = localStorage.getItem("crisismap:last-sync"); if (value) setState((p) => ({ ...p, lastSync: value })); } catch { /* Optional. */ }
    void probe();
    const timer = window.setInterval(probe, 15000);
    return () => {
      alive.current = false;
      window.clearInterval(timer);
      clearTimeout(dataTimer);
      channel?.close();
      window.removeEventListener(MODE_CHANGE_EVENT, onMode);
      window.removeEventListener(DATA_CHANGE_EVENT, onData);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("online", probe);
      window.removeEventListener("offline", onMode);
      window.removeEventListener("crisismap:offline-ready", onReady);
      document.removeEventListener("visibilitychange", probe);
      navigator.serviceWorker?.removeEventListener("controllerchange", notifyMode);
      navigator.serviceWorker?.removeEventListener("message", onWorkerMessage);
    };
  }, [notifyMode, refreshCounts, synchronize]);

  const setPreference = useCallback((mode: ModePreference) => {
    // Permit a fresh API probe immediately on reconnect; ongoing upload checks the gate before each item.
    if (mode === "online") setApiReachable(true);
    setModePreference(mode);
    if (mode === "online") void synchronize();
  }, [synchronize]);
  const syncNow = useCallback(async () => { await synchronize(true); }, [synchronize]);
  return <Context.Provider value={{ ...state, mode: state.isOnline ? "online" : "offline", setPreference, syncNow }}>{children}</Context.Provider>;
}
