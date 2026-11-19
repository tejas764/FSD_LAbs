"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MapPin, ShieldCheck, AlertTriangle, CircleX, HelpCircle } from "lucide-react";

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { apiClient, type ReportDetailResponse } from "@/lib/api/client";
import { formatRelativeTime } from "@/lib/time";
import { formatCoords } from "@/lib/utils";

// ─── types ────────────────────────────────────────────────────────────────────

export interface ReportDetailPopoverProps {
  reportId: string;
  children: React.ReactNode;
  mode: "hover" | "click";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

type ModerationStatusValue = "PENDING" | "APPROVED" | "REJECTED" | "FLAGGED" | "UNDER_REVIEW";

type AuditItem = {
  id: string;
  action: string;
  actorId: string;
  createdAt: string;
  moderationStatus: ModerationStatusValue | null;
};

// ─── constants ────────────────────────────────────────────────────────────────

const DAMAGE_ICON: Record<string, React.ElementType> = {
  MINIMAL: ShieldCheck,
  PARTIAL: AlertTriangle,
  COMPLETE: CircleX,
};

const DAMAGE_TEXT_COLOR: Record<string, string> = {
  MINIMAL: "text-[color:var(--damage-none)]",
  PARTIAL: "text-[color:var(--damage-partial)]",
  COMPLETE: "text-[color:var(--damage-complete)]",
};

// ─── help tooltip ─────────────────────────────────────────────────────────────

function HelpTooltip({ text }: { text: string }) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            type="button"
            aria-label={text}
            className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
          >
            <HelpCircle aria-hidden="true" className="size-3" />
          </button>
        </TooltipTrigger>
        <TooltipContent portal={false} side="top" className="w-52 text-xs leading-relaxed">
          {text}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function asModerationStatus(value: unknown): ModerationStatusValue | null {
  if (
    value === "PENDING" ||
    value === "APPROVED" ||
    value === "REJECTED" ||
    value === "FLAGGED" ||
    value === "UNDER_REVIEW"
  ) {
    return value;
  }
  return null;
}

function auditStatusChipClass(status: ModerationStatusValue | null): string {
  switch (status) {
    case "APPROVED":
      return "border-primary/30 bg-primary/10 text-primary";
    case "REJECTED":
      return "border-destructive/30 bg-destructive/10 text-destructive";
    case "FLAGGED":
      return "border-secondary/40 bg-secondary/20 text-foreground";
    case "UNDER_REVIEW":
      return "border-secondary/40 bg-secondary/20 text-foreground";
    case "PENDING":
      return "border-border bg-background text-muted-foreground";
    default:
      return "border-border bg-background text-foreground";
  }
}

// ─── inner content ────────────────────────────────────────────────────────────

export function ReportDetailContent({
  reportId,
  fallback,
  showAuditTrail = false,
  canLoadAudit = false,
}: {
  reportId: string;
  fallback?: React.ReactNode;
  showAuditTrail?: boolean;
  canLoadAudit?: boolean;
}) {
  const { t } = useTranslation();
  const [detail, setDetail] = useState<ReportDetailResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditState, setAuditState] = useState<{
    reportId: string;
    requested: boolean;
    loading: boolean;
    items: AuditItem[];
  }>({ reportId, requested: false, loading: false, items: [] });

  useEffect(() => {
    let cancelled = false;
    void apiClient.reports
      .getById(reportId)
      .then((res) => { if (!cancelled) { setDetail(res.data); setLoading(false); } })
      .catch(() => { if (!cancelled) { setDetail(null); setLoading(false); } });
    return () => { cancelled = true; };
  }, [reportId]);

  const currentAuditState =
    auditState.reportId === reportId
      ? auditState
      : { reportId, requested: false, loading: false, items: [] as AuditItem[] };

  const handleLoadAudit = () => {
    if (!showAuditTrail || !canLoadAudit || currentAuditState.loading || currentAuditState.requested) {
      return;
    }

    setAuditState({ reportId, requested: true, loading: true, items: [] });
    let cancelled = false;

    void apiClient.reports
      .audit(reportId, 1, 10)
      .then((response) => {
        if (cancelled) return;
        setAuditState((prev) => {
          if (prev.reportId !== reportId) return prev;
          return {
            ...prev,
            items: response.data.items.map((item) => ({
              id: item.id,
              action: item.action,
              actorId: item.actorId,
              createdAt: item.createdAt,
              moderationStatus: asModerationStatus(item.newValue?.moderationStatus),
            })),
          };
        });
      })
      .finally(() => {
        if (cancelled) return;
        setAuditState((prev) => {
          if (prev.reportId !== reportId) return prev;
          return { ...prev, loading: false };
        });
      });

    return () => {
      cancelled = true;
    };
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-36 w-full rounded-md" />
        <div className="space-y-2 px-1">
          <Skeleton className="h-3.5 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      </div>
    );
  }

  if (!detail) {
    return fallback ? <>{fallback}</> : <p className="text-xs text-muted-foreground">{t("error.load_failed")}</p>;
  }

  const DmgIcon = DAMAGE_ICON[detail.damageLevel] ?? ShieldCheck;
  const colorClass = DAMAGE_TEXT_COLOR[detail.damageLevel] ?? "text-muted-foreground";

  const proxyPhotoUrl = detail.photoUrl
    ? detail.photoUrl.replace(/^https?:\/\/[^/]+/, "/minio")
    : null;

  const location =
    detail.locationText ??
    (detail.latitude != null && detail.longitude != null
      ? formatCoords(detail.latitude, detail.longitude)
      : null);

  const infraLabel = detail.infraType
    ? t(`wizard.option.infra.${detail.infraType}` as `wizard.option.infra.${string}`, { defaultValue: detail.infraType })
    : null;

  const damageLabel = t(`damage_${detail.damageLevel.toLowerCase()}` as `damage_${string}`);
  const timeAgo = formatRelativeTime(detail.submittedAt, t);

  const waterDepth = detail.extraFields?.["water_depth_cm"] as string | number | undefined;
  const waterEntered = detail.extraFields?.["water_entered_building"] as string | boolean | undefined;
  const remainingExtras = Object.entries(detail.extraFields ?? {}).filter(
    ([k]) => k !== "water_depth_cm" && k !== "water_entered_building",
  );

  type CondRow = { label: string; value: string; highlight?: boolean; helpKey?: string };
  const conditionRows: CondRow[] = [];
  conditionRows.push({
    label: t("report_detail.has_debris"),
    value: detail.hasDebris ? t("report_detail.yes") : t("report_detail.no"),
    highlight: detail.hasDebris,
    helpKey: "report_detail.help_debris",
  });
  if (detail.electricityCondition) {
    conditionRows.push({
      label: t("report_detail.electricity"),
      value: t(`wizard.option.electricity.${detail.electricityCondition}` as `wizard.option.electricity.${string}`, { defaultValue: detail.electricityCondition }),
      helpKey: "report_detail.help_electricity",
    });
  }
  if (detail.healthServicesFunctioning) {
    conditionRows.push({
      label: t("report_detail.health_services"),
      value: t(`wizard.option.health.${detail.healthServicesFunctioning}` as `wizard.option.health.${string}`, { defaultValue: detail.healthServicesFunctioning }),
      helpKey: "report_detail.help_health_services",
    });
  }
  if (waterDepth != null && waterDepth !== "") {
    conditionRows.push({ label: t("report_detail.water_depth"), value: String(waterDepth) });
  }
  if (waterEntered != null && waterEntered !== "") {
    conditionRows.push({
      label: t("report_detail.water_entered"),
      value: typeof waterEntered === "boolean"
        ? (waterEntered ? t("report_detail.yes") : t("report_detail.no"))
        : t(`wizard.option.water_entered.${waterEntered}` as `wizard.option.water_entered.${string}`, { defaultValue: String(waterEntered) }),
    });
  }
  for (const [key, value] of remainingExtras) {
    conditionRows.push({ label: key.replace(/_/g, " "), value: String(value ?? "") });
  }

  const crisisLabel = detail.crisisType
    ? t(`wizard.option.crisis.${detail.crisisType}` as `wizard.option.crisis.${string}`, { defaultValue: detail.crisisType })
    : null;

  const hasNeeds = detail.pressingNeeds.length > 0 || !!detail.pressingNeedsOther;

  return (
    <div className="overflow-hidden rounded-md border border-border bg-card" role="region" aria-label={t("report_detail.title")}>
      {/* Photo — full bleed */}
      {proxyPhotoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={proxyPhotoUrl}
          alt=""
          aria-hidden="true"
          referrerPolicy="no-referrer"
          className="h-48 w-full object-cover"
        />
      )}

      {/* Header block */}
      <div className="space-y-1 px-3 pb-2 pt-2.5">
        {/* Row 1: damage icon + infraName · infraType + isDuplicate pill */}
        <div className="flex items-start gap-2">
          <DmgIcon aria-hidden="true" className={`mt-px size-3.5 shrink-0 ${colorClass}`} />
          <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
            <span className="text-sm font-semibold leading-snug text-card-foreground">
              {detail.infraName ?? (infraLabel ?? damageLabel)}
              {detail.infraName && infraLabel && (
                <span className="font-normal text-muted-foreground"> · {infraLabel}</span>
              )}
            </span>
            {detail.isDuplicate && (
              <span className="rounded bg-warning/10 px-1 py-px text-xs font-medium leading-tight text-warning">
                {t("reporter.my_reports.duplicate")}
              </span>
            )}
          </div>
        </div>

        {/* Row 2: location pin + coords · v{n} · time ago */}
        <div className="flex items-center gap-2">
          <MapPin aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
          <span className="text-xs leading-tight text-muted-foreground">
            {location ?? "—"}
            {detail.version > 1 && (
              <>
                <span aria-hidden="true" className="mx-1 opacity-40">·</span>
                {t("reporter.my_reports.version", { n: detail.version })}
              </>
            )}
            <span aria-hidden="true" className="mx-1 opacity-40">·</span>
            {timeAgo}
          </span>
        </div>

        {/* Row 3: description */}
        {detail.description && (
          <div className="flex gap-2">
            <span aria-hidden="true" className="size-3.5 shrink-0" />
            <p className="text-xs italic leading-relaxed text-muted-foreground">{detail.description}</p>
          </div>
        )}
      </div>

      <div className="border-t border-border" />

      {/* Condition rows */}
      <div className="space-y-1.5 px-3 py-2">
        {crisisLabel && (
          <div className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-muted-foreground">{t("step.crisisType.title")}</span>
            <span className="text-xs font-medium text-card-foreground">{crisisLabel}</span>
          </div>
        )}
        {conditionRows.map((row) => (
          <div key={row.label} className="flex items-baseline justify-between gap-2">
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              {row.label}
              {row.helpKey && <HelpTooltip text={t(row.helpKey as `report_detail.${string}`)} />}
            </span>
            <span className={`text-xs font-medium ${row.highlight ? "text-warning" : "text-card-foreground"}`}>
              {row.value}
            </span>
          </div>
        ))}
      </div>

      {/* Pressing needs */}
      {hasNeeds && (
        <>
          <div className="border-t border-border" />
          <div className="px-3 py-2">
            <div className="mb-1.5 flex items-center gap-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              <span>{t("report_detail.needs")}</span>
              <HelpTooltip text={t("report_detail.help_pressing_needs")} />
            </div>
            <div className="flex flex-wrap gap-1">
              {detail.pressingNeeds.map((need) => (
                <span key={need} className="rounded bg-primary/10 px-1.5 py-px text-xs font-medium text-primary">
                  {t(`wizard.option.pressing.${need}` as `wizard.option.pressing.${string}`, { defaultValue: need.replace(/_/g, " ") })}
                </span>
              ))}
              {detail.pressingNeedsOther && (
                <span className="rounded bg-muted px-1.5 py-px text-xs font-medium text-muted-foreground">
                  {detail.pressingNeedsOther}
                </span>
              )}
            </div>
          </div>
        </>
      )}

      {showAuditTrail && canLoadAudit ? (
        <>
          <div className="border-t border-border" />
          <section className="px-3 py-2">
            <h2 className="text-sm font-semibold text-foreground">{t("dashboard.moderation.audit_title")}</h2>
            {!currentAuditState.requested ? (
              <button
                type="button"
                aria-label={t("dashboard.moderation.load_audit")}
                className="mt-2 inline-flex h-7 items-center rounded-md border border-input bg-background px-2 text-xs font-medium shadow-xs hover:bg-accent hover:text-accent-foreground"
                onClick={handleLoadAudit}
              >
                {t("dashboard.moderation.load_audit")}
              </button>
            ) : currentAuditState.loading ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.overview.table_loading")}</p>
            ) : currentAuditState.items.length === 0 ? (
              <p className="mt-2 text-xs text-muted-foreground">{t("dashboard.moderation.audit_empty")}</p>
            ) : (
              <ol className="mt-3 space-y-3">
                {currentAuditState.items.map((item, index) => {
                  const isLast = index === currentAuditState.items.length - 1;
                  return (
                    <li key={item.id} className="relative ps-5">
                      <span
                        aria-hidden="true"
                        className="absolute start-0 top-1.5 size-2 rounded-full bg-primary"
                      />
                      {!isLast ? (
                        <span
                          aria-hidden="true"
                          className="absolute start-[3px] top-4 h-[calc(100%-10px)] w-px bg-border"
                        />
                      ) : null}

                      <div className="rounded-md border border-border bg-muted/30 px-2 py-1.5 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className={`rounded-full border px-1.5 py-0.5 font-semibold ${auditStatusChipClass(item.moderationStatus)}`}>
                            {item.moderationStatus
                              ? t(
                                `reporter.my_reports.moderation.${item.moderationStatus}` as `reporter.my_reports.moderation.${ModerationStatusValue}`,
                              )
                              : item.action}
                          </span>
                          <span className="text-muted-foreground">{item.actorId}</span>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          {formatRelativeTime(item.createdAt, t)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

// ─── component ────────────────────────────────────────────────────────────────

export function ReportDetailPopover({
  reportId,
  children,
  mode,
  open,
  onOpenChange,
}: ReportDetailPopoverProps) {
  if (mode === "hover") {
    return (
      <HoverCard>
        <HoverCardTrigger asChild>{children}</HoverCardTrigger>
        <HoverCardContent side="right" align="start" className="w-72">
          <ReportDetailContent reportId={reportId} />
        </HoverCardContent>
      </HoverCard>
    );
  }

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72">
        <ReportDetailContent reportId={reportId} />
      </PopoverContent>
    </Popover>
  );
}
