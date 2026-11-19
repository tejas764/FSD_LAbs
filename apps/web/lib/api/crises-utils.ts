import type { Crisis } from "./client";

/**
 * Returns the full display name for an ISO 3166-1 alpha-2 country code.
 * Falls back to the raw code if Intl.DisplayNames is unavailable or throws.
 *
 * @example getCountryName("SY", "en") // → "Syria"
 * @example getCountryName("SY", "fr") // → "Syrie"
 */
export function getCountryName(code: string, locale: string): string {
    try {
        return new Intl.DisplayNames([locale, "en"], { type: "region" }).of(code) ?? code;
    } catch {
        return code;
    }
}

/**
 * Merges two Crisis arrays, deduplicating by id and preserving arr1 order.
 * Items from arr2 that are not already in arr1 are appended.
 */
export function mergeCrisesUnique(arr1: Crisis[], arr2: Crisis[]): Crisis[] {
    const seen = new Set(arr1.map((c) => c.id));
    return [...arr1, ...arr2.filter((c) => !seen.has(c.id))];
}
