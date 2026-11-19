"use client";

import { useTranslation } from "react-i18next";
import { ShieldCheck, AlertTriangle, CircleX, RotateCcw, Pencil, MapPin } from "lucide-react";
import type { DamageLevel } from "@/types/wizard";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { MouseEvent } from "react";
import { formatRelativeTime } from "@/lib/time";

export type SyncStatus = "synced" | "pending" | "failed";

interface ReportCardProps {
    id: string;
    infrastructureName: string;
    infraType?: string | null;
    crisisName?: string | null;
    crisisType?: string | null;
    locationText: string;
    damagedAt: string;
    damageLevel: DamageLevel;
    syncStatus: SyncStatus;
    moderationStatus?: string | null;
    pressingNeeds?: string[];
    errorCode?: string | null;
    version?: number;
    onRetry?: () => void;
    onEditRetry?: () => void;
    onView?: () => void;
}

const DAMAGE_META: Record<
    DamageLevel,
    { key: "damage_minimal" | "damage_partial" | "damage_complete"; Icon: React.ElementType; dataValue: string; colorClass: string; borderClass: string }
> = {
    MINIMAL: { key: "damage_minimal", Icon: ShieldCheck, dataValue: "minimal", colorClass: "text-[color:var(--damage-none)]", borderClass: "border-s-[color:var(--damage-none)]" },
    PARTIAL: { key: "damage_partial", Icon: AlertTriangle, dataValue: "partial", colorClass: "text-[color:var(--damage-partial)]", borderClass: "border-s-[color:var(--damage-partial)]" },
    COMPLETE: { key: "damage_complete", Icon: CircleX, dataValue: "complete", colorClass: "text-[color:var(--damage-complete)]", borderClass: "border-s-[color:var(--damage-complete)]" },
};

const SYNC_META: Record<SyncStatus, { tKey: string; className: string }> = {
    synced: { tKey: "sync.synced", className: "text-[color:var(--success)] bg-[color:var(--success)]/10" },
    pending: { tKey: "sync.queued", className: "text-[color:var(--warning)] bg-[color:var(--warning)]/10" },
    failed: { tKey: "sync.failed", className: "text-[color:var(--destructive)] bg-[color:var(--destructive)]/10" },
};

function moderationColor(status: string): string {
    if (status === "APPROVED") return "text-damage-none";
    if (status === "REJECTED") return "text-destructive";
    if (status === "FLAGGED") return "text-damage-partial";
    if (status === "UNDER_REVIEW") return "text-primary";
    return "text-muted-foreground";
}

export function ReportCard({
    infrastructureName,
    infraType,
    crisisName,
    crisisType,
    locationText,
    damagedAt,
    damageLevel,
    syncStatus,
    moderationStatus,
    pressingNeeds = [],
    errorCode,
    version,
    onRetry,
    onEditRetry,
    onView,
}: ReportCardProps) {
    const { t } = useTranslation();

    const { Icon: DamageIcon, colorClass, borderClass } = DAMAGE_META[damageLevel];
    const { tKey: syncKey, className: syncClass } = SYNC_META[syncStatus];
    const relativeTime = formatRelativeTime(damagedAt, t);

    const infraTypeLabel = infraType
        ? t(`wizard.option.infra.${infraType}` as `wizard.option.infra.${string}`, { defaultValue: infraType })
        : null;
    const crisisTypeLabel = crisisType
        ? t(`wizard.option.crisis.${crisisType}` as `wizard.option.crisis.${string}`, { defaultValue: crisisType })
        : null;

    const stopProp = (e: MouseEvent) => e.stopPropagation();

    return (
        <article
            className={cn(
                "rounded-md border border-border bg-card shadow-sm transition-colors border-s-4",
                borderClass,
                onView ? "cursor-pointer hover:bg-accent/30 focus-within:ring-2 focus-within:ring-ring" : "hover:bg-accent/10",
            )}
            data-damage={DAMAGE_META[damageLevel].dataValue}
            onClick={onView}
            tabIndex={onView ? 0 : undefined}
            onKeyDown={onView ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onView(); } } : undefined}
            aria-label={onView ? t("reporter.my_reports.view_detail") : undefined}
        >
            <div className="flex items-start gap-2.5 px-4 py-3 ps-4">
                <DamageIcon
                    aria-hidden="true"
                    className={cn("mt-0.5 size-4 shrink-0", colorClass)}
                    data-testid="damage-icon"
                />
                <span className="sr-only">{t(DAMAGE_META[damageLevel].key)}</span>

                <div className="min-w-0 flex-1 space-y-1">
                    {/* Row 1: infra name · infra type */}
                    <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-card-foreground">
                                {infrastructureName}
                                {infraTypeLabel && (
                                    <span className="ms-1 font-normal text-muted-foreground">· {infraTypeLabel}</span>
                                )}
                            </p>
                        </div>
                        {crisisTypeLabel && (
                            <span className="shrink-0 text-xs leading-tight text-muted-foreground">{crisisTypeLabel}</span>
                        )}
                    </div>

                    {/* Row 2: crisis name */}
                    {crisisName && (
                        <p className="truncate text-xs text-muted-foreground">
                            {crisisName}
                        </p>
                    )}

                    {/* Row 3: location + time + version */}
                    <div className="flex items-center gap-1.5">
                        <MapPin aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                        <p className="truncate text-xs text-muted-foreground">
                            <span>{locationText}</span>
                            <span aria-hidden="true" className="mx-1 opacity-40">·</span>
                            <span>{relativeTime}</span>
                            {version != null && version > 1 && (
                                <>
                                    <span aria-hidden="true" className="mx-1 opacity-40">·</span>
                                    <span className="font-medium text-primary">{t("reporter.my_reports.version", { n: version })}</span>
                                </>
                            )}
                        </p>
                    </div>

                    {/* Row 4: sync badge + moderation */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${syncClass}`}>{t(syncKey)}</span>
                        {moderationStatus && (
                            <span className={`text-xs font-medium ${moderationColor(moderationStatus)}`}>
                                {t(`reporter.my_reports.moderation.${moderationStatus}`)}
                            </span>
                        )}
                    </div>

                    {/* Pressing needs — cap at 2 with overflow pill */}
                    {pressingNeeds.length > 0 && (
                        <div className="flex flex-wrap gap-1" aria-label={t("reporter.wizard.fields.pressing_needs")}>
                            {pressingNeeds.slice(0, 2).map((need) => (
                                <span
                                    key={need}
                                    className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary"
                                >
                                    {t(`wizard.option.pressing.${need}`)}
                                </span>
                            ))}
                            {pressingNeeds.length > 2 && (
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground hover:bg-muted/80"
                                        >
                                            {t("reporter.my_reports.needs_more", { count: pressingNeeds.length - 2 })}
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent>
                                        <div className="flex flex-col gap-1">
                                            {pressingNeeds.slice(2).map((need) => (
                                                <span key={need}>{t(`wizard.option.pressing.${need}`)}</span>
                                            ))}
                                        </div>
                                    </TooltipContent>
                                </Tooltip>
                            )}
                        </div>
                    )}

                    {syncStatus === "failed" && (
                        <>
                            {errorCode && (
                                <p className="text-xs text-destructive">{t(`error.${errorCode}`)}</p>
                            )}
                            <div className="flex flex-wrap gap-2">
                                {onRetry && (
                                    <Button size="sm" onClick={(e) => { stopProp(e); onRetry(); }} className="gap-1.5">
                                        <RotateCcw aria-hidden="true" className="size-3.5" />
                                        {t("reporter.my_reports.retry")}
                                    </Button>
                                )}
                                {onEditRetry && (
                                    <Button size="sm" variant="outline" onClick={(e) => { stopProp(e); onEditRetry(); }} className="gap-1.5">
                                        <Pencil aria-hidden="true" className="size-3.5" />
                                        {t("reporter.my_reports.edit_retry")}
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </article>
    );
}
