/** Shared by the API client, queues and React provider; never imports React. */
export type ModePreference = "online" | "offline";
export const MODE_STORAGE_KEY = "crisismap:mode";
export const MODE_CHANGE_EVENT = "crisismap:mode-change";
export const DATA_CHANGE_EVENT = "crisismap:data-change";
let apiReachable = true;
let preference: ModePreference = "online";

export function getModePreference(): ModePreference {
  if (typeof window === "undefined") return "online";
  try {
    const value = localStorage.getItem(MODE_STORAGE_KEY);
    if (value === "online" || value === "offline") preference = value;
  } catch { /* Memory preference still works when storage is restricted. */ }
  return preference;
}

export function setModePreference(mode: ModePreference): void {
  preference = mode;
  try { localStorage.setItem(MODE_STORAGE_KEY, mode); } catch { /* Keep the in-memory choice. */ }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
}

export function setApiReachable(reachable: boolean): void {
  const changed = apiReachable !== reachable;
  apiReachable = reachable;
  if (changed && typeof window !== "undefined") window.dispatchEvent(new Event(MODE_CHANGE_EVENT));
}

export function isOfflineMode(): boolean {
  if (typeof window === "undefined") return false;
  return getModePreference() === "offline" || navigator.onLine === false || !apiReachable;
}
