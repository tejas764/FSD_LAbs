"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Award, CheckCircle2, Star } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { SyncStatus, type SyncStatusState } from "@/components/ui/sync-status";
import { apiClient } from "@/lib/api/client";

const BADGE_LABEL_KEYS = {
    NEWCOMER: "reporter.badge.newcomer",
    CONTRIBUTOR: "reporter.badge.contributor",
    TRUSTED: "reporter.badge.trusted",
    EXPERT: "reporter.badge.expert",
} as const;

const BADGE_MILESTONES = [5, 20, 50] as const;

function normalizeStatus(value: string | null): SyncStatusState {
    if (value === "queued") return "queued";
    if (value === "syncing") return "syncing";
    if (value === "synced") return "synced";
    if (value === "failed") return "failed";
    return "local";
}

function getNextMilestone(reportCount: number): number | null {
    return BADGE_MILESTONES.find((threshold) => reportCount < threshold) ?? null;
}

function getBadgeLabel(t: (key: string) => string, badgeLevel: string | null): string {
    if (!badgeLevel) return t(BADGE_LABEL_KEYS.NEWCOMER);

    const normalized = badgeLevel.toUpperCase() as keyof typeof BADGE_LABEL_KEYS;
    const translationKey = BADGE_LABEL_KEYS[normalized];
    return translationKey ? t(translationKey) : badgeLevel;
}

export function SuccessContent() {
    const { t } = useTranslation();
    const params = useSearchParams();

    const reportId = params.get("reportId") || "local";
    const status = normalizeStatus(params.get("status"));
    const reporterId = params.get("reporterId");
    const crisisId = params.get("crisisId");
    const isOffline = params.get("offline") === "1";

    const [reportCount, setReportCount] = useState<number | null>(null);
    const [badgeLevel, setBadgeLevel] = useState<string | null>(null);

    useEffect(() => {
        let active = true;

        async function loadImpact() {
            if (isOffline || !reporterId || !crisisId) return;

            try {
                const [profile] = await Promise.all([
                    apiClient.reporter.profile(reporterId),
                    apiClient.analytics.hotspots(crisisId).catch(() => null),
                ]);

                if (!active) return;
                setReportCount(profile.data.reportCount);
                setBadgeLevel(profile.data.badgeLevel ?? null);
            } catch {
                if (!active) return;
                setReportCount(null);
                setBadgeLevel(null);
            }
        }

        loadImpact();

        return () => {
            active = false;
        };
    }, [crisisId, isOffline, reporterId]);

    return (
        <section className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6">
            <header className="flex items-start gap-4">
                <span className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary/10 ring-2 ring-primary/20">
                    <CheckCircle2 aria-hidden="true" className="h-7 w-7 text-primary" data-testid="success-hero-icon" />
                </span>
                <div className="space-y-1 pt-1">
                    <h2 className="text-xl font-semibold text-foreground">
                        {t("reporter.success.title")}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        {t("reporter.success.report_id", { id: "" })}
                        <code data-testid="report-reference" className="ms-1 rounded bg-primary/10 px-1.5 py-0.5 font-mono text-xs text-primary">
                            {reportId}
                        </code>
                    </p>
                </div>
            </header>

            <div className="space-y-4">
                <SyncStatus status={status} size="md" />
                <div className="grid grid-cols-2 gap-3">
                    <Link
                        href="/"
                        className="inline-flex w-full min-h-11 items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
                    >
                        {t("reporter.success.return_to_map")}
                    </Link>
                    <Link
                        href="/report"
                        className="inline-flex w-full min-h-11 items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground"
                    >
                        {t("reporter.success.submit_another")}
                    </Link>
                </div>
            </div>

            {!isOffline && reportCount !== null && (
                <section className="space-y-4 border-t border-border/40 pt-4">
                    <section className="space-y-2" aria-labelledby="impact-heading">
                        <div className="flex items-center gap-2">
                            <Star aria-hidden="true" className="size-4 text-primary" />
                            <h3 className="text-sm font-semibold text-foreground" id="impact-heading">
                                {t("reporter.success.impact_title")}
                            </h3>
                        </div>
                        <p className="text-sm text-foreground">
                            {t("reporter.success.impact_count", { count: reportCount })}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {reportCount === 1
                                ? t("reporter.success.first_time_guidance")
                                : t("reporter.success.returning_coverage")}
                        </p>
                        <p className="text-sm text-muted-foreground">
                            {t("reporter.success.follow_up_prompt")}
                        </p>
                    </section>

                    <section className="space-y-3 rounded-lg border border-border bg-muted/20 p-4" aria-labelledby="status-heading">
                        <div className="flex items-center gap-2">
                            <Award aria-hidden="true" className="size-4 text-primary" />
                            <h3 className="text-sm font-semibold text-foreground" id="status-heading">
                                {t("reporter.success.status_title")}
                            </h3>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {t("reporter.success.status_description")}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                            <Badge variant="secondary" className="capitalize">
                                {getBadgeLabel(t, badgeLevel)}
                            </Badge>
                            <span className="text-sm text-foreground">
                                {t("reporter.success.impact_count", { count: reportCount })}
                            </span>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            {getNextMilestone(reportCount) !== null
                                ? t("reporter.success.next_milestone", { count: getNextMilestone(reportCount) })
                                : t("reporter.success.top_tier")}
                        </p>
                    </section>
                </section>
            )}
        </section>
    );
}
