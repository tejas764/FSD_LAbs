"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import i18next, { type i18n } from "i18next";
import { I18nextProvider, initReactI18next } from "react-i18next";
import { detectLanguage, i18nConfig, type SupportedLanguage } from "./config";

// ---------------------------------------------------------------------------
// Context — exposes current language + change handler to the component tree
// ---------------------------------------------------------------------------

interface I18nContextValue {
  language: SupportedLanguage;
  setLanguage: (lang: SupportedLanguage) => void;
}

const I18nContext = createContext<I18nContextValue>({
  language: "en",
  setLanguage: () => {},
});

export function useI18nLanguage(): I18nContextValue {
  return useContext(I18nContext);
}

// ---------------------------------------------------------------------------
// Singleton i18next instance (with react-i18next plugin)
// ---------------------------------------------------------------------------

// Resources are injected at provider mount to avoid re-reading files on each render.
type Resources = Record<string, { common: Record<string, string> }>;

function createI18nInstance(
  resources: Resources,
  language: SupportedLanguage,
): i18n {
  const instance = i18next.createInstance();
  // Initialise synchronously — resources are pre-loaded
  instance.use(initReactI18next).init({
    lng: language,
    fallbackLng: i18nConfig.defaultLanguage,
    ns: ["common"],
    defaultNS: "common",
    resources,
    interpolation: { escapeValue: false },
    react: { useSuspense: false },
  });
  return instance;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface I18nProviderProps {
  children: ReactNode;
  /**
   * Pre-loaded translation resources passed in from the server component.
   * Shape: { ar: { common: {...} }, en: { common: {...} }, ... }
   */
  resources: Resources;
  /** Initial language — detected server-side and passed as a prop. */
  initialLanguage: SupportedLanguage;
}

export function I18nProvider({
  children,
  resources,
  initialLanguage,
}: I18nProviderProps) {
  const [language, setLanguageState] =
    useState<SupportedLanguage>(initialLanguage);
  const [i18nInstance] = useState(() =>
    createI18nInstance(resources, initialLanguage),
  );

  const setLanguage = (lang: SupportedLanguage) => {
    i18nInstance.changeLanguage(lang);
    setLanguageState(lang);

    // Reflect language in the HTML element — dir and lang attributes
    if (typeof document !== "undefined") {
      document.documentElement.lang = lang;
      document.documentElement.dir = i18nConfig.rtlLanguages.includes(
        lang as (typeof i18nConfig.rtlLanguages)[number],
      )
        ? "rtl"
        : "ltr";
    }
  };

  // Sync HTML element on initial render (the server may have set a different lang)
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language;
      document.documentElement.dir = i18nConfig.rtlLanguages.includes(
        language as (typeof i18nConfig.rtlLanguages)[number],
      )
        ? "rtl"
        : "ltr";
    }
  }, [language]);

  return (
    <I18nContext.Provider value={{ language, setLanguage }}>
      <I18nextProvider i18n={i18nInstance}>{children}</I18nextProvider>
    </I18nContext.Provider>
  );
}

// Re-export detectLanguage so callers can use just this module
export { detectLanguage, i18nConfig, type SupportedLanguage };
