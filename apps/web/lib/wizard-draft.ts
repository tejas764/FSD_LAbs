/**
 * Shared constants for the reporter wizard sessionStorage draft.
 * Import from here instead of hardcoding the key in components.
 */
export const DRAFT_STORAGE_KEY = "crisismap_reporter_wizard_v2";

const REPORTER_ID_KEY = "crisismap_reporter_id";

/**
 * Returns the persistent anonymous reporter ID stored in localStorage,
 * creating a new UUID if one does not yet exist.
 */
export function getOrCreateReporterId(): string {
  if (typeof window === "undefined") return crypto.randomUUID();
  const existing = localStorage.getItem(REPORTER_ID_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  localStorage.setItem(REPORTER_ID_KEY, id);
  return id;
}
