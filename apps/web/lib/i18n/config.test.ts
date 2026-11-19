import { describe, it, expect, beforeEach, vi } from "vitest";
import { detectLanguage, i18nConfig } from "./config";
import { initI18n } from "./config.server";

describe("i18n/config", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  describe("detectLanguage", () => {
    it("detects Arabic from HTML lang attribute", () => {
      expect(detectLanguage("ar", undefined)).toBe("ar");
    });

    it("detects Chinese from HTML lang attribute", () => {
      expect(detectLanguage("zh", undefined)).toBe("zh");
    });

    it("detects French from HTML lang attribute", () => {
      expect(detectLanguage("fr", undefined)).toBe("fr");
    });

    it("detects Russian from HTML lang attribute", () => {
      expect(detectLanguage("ru", undefined)).toBe("ru");
    });

    it("detects Spanish from HTML lang attribute", () => {
      expect(detectLanguage("es", undefined)).toBe("es");
    });

    it("detects English from HTML lang attribute", () => {
      expect(detectLanguage("en", undefined)).toBe("en");
    });

    it("normalizes language sub-tags to base code (fr-FR → fr)", () => {
      expect(detectLanguage("fr-FR", undefined)).toBe("fr");
    });

    it("normalizes Chinese sub-tags (zh-CN → zh)", () => {
      expect(detectLanguage("zh-CN", undefined)).toBe("zh");
    });

    it("normalizes en-US to en", () => {
      expect(detectLanguage("en-US", undefined)).toBe("en");
    });

    it("falls back to navigator language when htmlLang is empty", () => {
      expect(detectLanguage("", "fr-FR")).toBe("fr");
    });

    it("falls back to navigator language when htmlLang is unsupported", () => {
      expect(detectLanguage("de", "es-ES")).toBe("es");
    });

    it('falls back to "en" when htmlLang is unsupported and navigator is unsupported', () => {
      expect(detectLanguage("de", "ja-JP")).toBe("en");
    });

    it('falls back to "en" when both htmlLang and navigator are absent', () => {
      expect(detectLanguage(undefined, undefined)).toBe("en");
    });

    it('falls back to "en" when htmlLang is absent and navigator is unsupported', () => {
      expect(detectLanguage(undefined, "de-DE")).toBe("en");
    });
  });

  describe("i18nConfig", () => {
    it("lists all 6 UN languages in supportedLanguages", () => {
      expect(i18nConfig.supportedLanguages).toEqual([
        "ar",
        "zh",
        "en",
        "fr",
        "ru",
        "es",
      ]);
    });

    it('sets defaultLanguage to "en"', () => {
      expect(i18nConfig.defaultLanguage).toBe("en");
    });

    it('includes "ar" in rtlLanguages', () => {
      expect(i18nConfig.rtlLanguages).toContain("ar");
    });

    it('does not include "en" in rtlLanguages', () => {
      expect(i18nConfig.rtlLanguages).not.toContain("en");
    });
  });

  describe("initI18n", () => {
    it("returns an i18next instance with t() function", async () => {
      const i18n = await initI18n("en");
      expect(typeof i18n.t).toBe("function");
    });

    it("initializes with the requested language", async () => {
      const i18n = await initI18n("fr");
      expect(i18n.language).toBe("fr");
    });

    it("loads app_name from en locale", async () => {
      const i18n = await initI18n("en");
      expect(typeof i18n.t("app_name")).toBe("string");
      expect(i18n.t("app_name").length).toBeGreaterThan(0);
    });

    it("loads app_name from ar locale", async () => {
      const i18n = await initI18n("ar");
      expect(typeof i18n.t("app_name")).toBe("string");
      expect(i18n.t("app_name").length).toBeGreaterThan(0);
    });

    it("loads app_name from zh locale", async () => {
      const i18n = await initI18n("zh");
      expect(typeof i18n.t("app_name")).toBe("string");
      expect(i18n.t("app_name").length).toBeGreaterThan(0);
    });

    it("loads app_name from fr locale", async () => {
      const i18n = await initI18n("fr");
      expect(typeof i18n.t("app_name")).toBe("string");
      expect(i18n.t("app_name").length).toBeGreaterThan(0);
    });

    it("loads app_name from ru locale", async () => {
      const i18n = await initI18n("ru");
      expect(typeof i18n.t("app_name")).toBe("string");
      expect(i18n.t("app_name").length).toBeGreaterThan(0);
    });

    it("loads app_name from es locale", async () => {
      const i18n = await initI18n("es");
      expect(typeof i18n.t("app_name")).toBe("string");
      expect(i18n.t("app_name").length).toBeGreaterThan(0);
    });

    it('reports dir()="rtl" when language is Arabic', async () => {
      const i18n = await initI18n("ar");
      expect(i18n.dir()).toBe("rtl");
    });

    it('reports dir()="ltr" when language is English', async () => {
      const i18n = await initI18n("en");
      expect(i18n.dir()).toBe("ltr");
    });

    it('reports dir()="ltr" when language is Chinese', async () => {
      const i18n = await initI18n("zh");
      expect(i18n.dir()).toBe("ltr");
    });

    it('defaults to "en" when no language argument is given', async () => {
      const i18n = await initI18n();
      expect(i18n.language).toBe("en");
    });
  });
});
