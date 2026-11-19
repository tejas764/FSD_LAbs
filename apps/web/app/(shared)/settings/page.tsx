"use client";

import { useTranslation } from "react-i18next";

import { ReporterShell } from "@/components/shared/reporter-shell";

export default function SettingsPage() {
  const { t } = useTranslation();

  return (
    <ReporterShell>
      <section className="space-y-3 rounded-xl border border-border bg-card p-5 sm:p-6">
        <h2 className="text-lg font-semibold text-card-foreground">{t("shared.settings.title")}</h2>
        <p className="text-sm text-muted-foreground">{t("shared.settings.placeholder")}</p>
      </section>
    </ReporterShell>
  );
}