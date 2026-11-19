/**
 * Shared time formatting utilities.
 * Used across reporter and dashboard components.
 */

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Returns a human-readable relative time string using i18n keys.
 * Falls back to a locale date string for dates older than a week.
 */
export function formatRelativeTime(iso: string, t: TFn): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime();
    const diffMin = Math.floor(diffMs / 60_000);
    if (diffMin < 1) return t("time.just_now");
    if (diffMin < 60) return t("time.minutes_ago", { count: diffMin });
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return t("time.hours_ago", { count: diffH });
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return t("time.days_ago", { count: diffD });
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}
