import i18next, { type i18n } from "i18next";
import { readFile } from "fs/promises";
import path from "path";
import { i18nConfig, type SupportedLanguage } from "./config";

/**
 * Load a locale JSON file from public/locales/{lang}/common.json.
 * Server / Node only — uses fs.
 */
async function loadLocale(
  lang: SupportedLanguage,
): Promise<Record<string, string>> {
  const filePath = path.resolve(
    process.cwd(),
    "public",
    "locales",
    lang,
    "common.json",
  );
  const raw = await readFile(filePath, "utf-8");
  return JSON.parse(raw) as Record<string, string>;
}

/**
 * Create and initialise a standalone i18next instance for the given language.
 * Loads translations from public/locales/{lang}/common.json.
 * Server / Node only — do not import this in Client Components.
 */
export async function initI18n(language?: string): Promise<i18n> {
  const resolved: SupportedLanguage = ((): SupportedLanguage => {
    if (!language) return i18nConfig.defaultLanguage;
    const base = language.split("-")[0].toLowerCase();
    return (i18nConfig.supportedLanguages as readonly string[]).includes(base)
      ? (base as SupportedLanguage)
      : i18nConfig.defaultLanguage;
  })();

  const resources: Record<string, { common: Record<string, string> }> = {};
  await Promise.all(
    i18nConfig.supportedLanguages.map(async (lang) => {
      resources[lang] = { common: await loadLocale(lang) };
    }),
  );

  const instance = i18next.createInstance();
  await instance.init({
    lng: resolved,
    fallbackLng: i18nConfig.defaultLanguage,
    ns: ["common"],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
  });

  return instance;
}
