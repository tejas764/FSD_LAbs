export const i18nConfig = {
  supportedLanguages: ["ar", "zh", "en", "fr", "ru", "es"] as const,
  defaultLanguage: "en" as const,
  rtlLanguages: ["ar"] as const,
} as const;

export type SupportedLanguage = (typeof i18nConfig.supportedLanguages)[number];

/**
 * Detect the best supported language from the detection chain:
 * htmlLang → navigatorLanguage → 'en'
 *
 * Accepts raw strings (lang attribute value, navigator.language value)
 * so this function is pure and testable without a DOM.
 */
export function detectLanguage(
  htmlLang: string | undefined,
  navigatorLanguage: string | undefined,
): SupportedLanguage {
  const normalize = (code: string): SupportedLanguage | null => {
    // Strip sub-tag: 'fr-FR' → 'fr', 'zh-CN' → 'zh'
    const base = code.split("-")[0].toLowerCase() as SupportedLanguage;
    return (i18nConfig.supportedLanguages as readonly string[]).includes(base)
      ? base
      : null;
  };

  if (htmlLang) {
    const lang = normalize(htmlLang);
    if (lang) return lang;
  }

  if (navigatorLanguage) {
    const lang = normalize(navigatorLanguage);
    if (lang) return lang;
  }

  return i18nConfig.defaultLanguage;
}
