import { initI18n } from "./config.server";
import { i18nConfig, type SupportedLanguage } from "./config";

// Cache i18n instances per language to avoid repeated file I/O
const i18nCache = new Map<
  SupportedLanguage,
  Awaited<ReturnType<typeof initI18n>>
>();

/**
 * Translate an error message for API responses.
 * Detects language from Accept-Language header or defaults to English.
 * Supports interpolation variables (e.g., { maxSize: 5 }).
 * Server/API only.
 */
export async function translateError(
  errorKey: string,
  headers?: {
    get(name: string): string | null;
  },
  interpolation?: Record<string, string | number>,
): Promise<string> {
  // Detect language from Accept-Language header or default to 'en'
  let language: SupportedLanguage = i18nConfig.defaultLanguage;

  if (headers) {
    const acceptLanguage = headers.get("accept-language");
    if (acceptLanguage) {
      const base = acceptLanguage.split(",")[0].split("-")[0].toLowerCase();
      if ((i18nConfig.supportedLanguages as readonly string[]).includes(base)) {
        language = base as SupportedLanguage;
      }
    }
  }

  // Use cached instance or initialize new one
  let i18n = i18nCache.get(language);
  if (!i18n) {
    try {
      i18n = await initI18n(language);
      i18nCache.set(language, i18n);
    } catch {
      // Fallback to English key if i18n initialization fails
      return errorKey;
    }
  }

  // Return translated error message with interpolation, falling back to key if missing
  try {
    return i18n.t(errorKey, {
      defaultValue: errorKey,
      ...interpolation,
    });
  } catch {
    // Final fallback to the key itself
    return errorKey;
  }
}
