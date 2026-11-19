import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

type LocaleObject = Record<string, unknown>;

const reporterKeys = [
  "step.infraType.title",
  "step.crisisType.title",
  "step.details.title",
  "step.details.instructions",
  "step.details.infra_name_label",
  "step.details.infra_name_placeholder",
  "step.details.has_debris_label",
  "step.location.location_text_instructions",
  "step.location.location_text_placeholder",
  "step.confirm.location_text_label",
  "error.submission_failed",
  "common.yes",
  // Success & Impact Messaging
  "reporter.success.title",
  "reporter.success.submit_another",
  "reporter.success.return_to_map",
  "reporter.success.impact_title",
  "reporter.success.impact_count",
  "reporter.success.first_time_guidance",
  "reporter.success.returning_coverage",
  "reporter.success.follow_up_prompt",
  // Offline queue / sync
  "sync.saved_locally",
  "sync.queued_with_count",
  "sync.syncing",
  "sync.synced",
  "sync.failed",
  "connectivity.offline_saved_locally",
  "connectivity.reconnecting_uploading",
  "connectivity.all_synced",
] as const;

function loadLocale(language: string): LocaleObject {
  const filePath = path.resolve(
    process.cwd(),
    "public",
    "locales",
    language,
    "common.json",
  );

  return JSON.parse(readFileSync(filePath, "utf-8")) as LocaleObject;
}

const en = loadLocale("en");

const locales = {
  ar: loadLocale("ar"),
  zh: loadLocale("zh"),
  fr: loadLocale("fr"),
  ru: loadLocale("ru"),
  es: loadLocale("es"),
} satisfies Record<string, LocaleObject>;

function getValue(source: LocaleObject, key: string): string {
  const value = key.split(".").reduce<unknown>((current, segment) => {
    if (typeof current !== "object" || current === null) {
      return undefined;
    }

    return (current as LocaleObject)[segment];
  }, source);

  if (typeof value !== "string") {
    throw new Error(`Expected string value for locale key: ${key}`);
  }

  return value;
}

describe("locale reporter translations", () => {
  for (const [language, locale] of Object.entries(locales)) {
    it(`${language} reporter-specific strings are translated`, () => {
      for (const key of reporterKeys) {
        expect(getValue(locale, key)).not.toBe(getValue(en, key));
      }
    });
  }
});
