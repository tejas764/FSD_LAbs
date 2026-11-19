import { drainQueue } from "./sync";

export const SW_URL = "/sw.js";
let registrationStarted = false;

/** Cache production bundles only; development HMR must never be served stale. */
export function registerServiceWorker(swUrl = SW_URL): void {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  if (process.env.NODE_ENV === "development") {
    void navigator.serviceWorker.getRegistrations?.().then(async (registrations) => {
      for (const registration of registrations) {
        if (registration.active?.scriptURL === new URL(swUrl, location.origin).href) await registration.unregister();
      }
      if (typeof caches !== "undefined") {
        for (const key of await caches.keys()) if (key.startsWith("crisismap-")) await caches.delete(key);
      }
    }).catch(() => {});
    return;
  }
  if (registrationStarted) return;
  registrationStarted = true;
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register(swUrl);
      if (registration.waiting) registration.waiting.postMessage({ type: "SKIP_WAITING" });
      registration.addEventListener?.("updatefound", () => {
        const incoming = registration.installing;
        incoming?.addEventListener("statechange", () => {
          if (incoming.state === "installed") incoming.postMessage({ type: "SKIP_WAITING" });
        });
      });
      // Activation never reloads a page: a draft or in-flight photo must survive updates.
      await registration.update?.();
    } catch {
      registrationStarted = false;
    }
  };
  if (typeof document !== "undefined" && document.readyState === "complete") void register();
  else window.addEventListener("load", () => { void register(); }, { once: true });
}

/** Compatibility helper; the application provider owns automatic sync. */
export function setupOnlineSync(sendFn: (url: string, config: RequestInit) => Promise<Response>): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => { void drainQueue(sendFn).catch(() => {}); };
  window.addEventListener("online", handler);
  return () => window.removeEventListener("online", handler);
}
