"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { CircleHelp } from "lucide-react";

import { CrisisSelector } from "@/components/composed/crisis-selector";
import { ExportViewportMap } from "@/components/composed/export-viewport-map";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { apiClient, type CreateExportRequest, type ExportJobStatus } from "@/lib/api/client";
import { useSession } from "@/lib/auth-client";

type ExportFormat = "csv" | "geojson" | "shapefile";

type ExportJobView = {
    jobId: string;
    status: ExportJobStatus["status"];
    url?: string;
    expiresAt?: string;
    request: CreateExportRequest;
};

const TERMINAL_STATUSES: ReadonlySet<ExportJobStatus["status"]> = new Set(["completed", "failed"]);
const ALL_CRISES_STREAMING_MAX_RANGE_MS = 365 * 24 * 60 * 60 * 1000;
const ALL_CRISES_SHAPEFILE_MAX_RANGE_MS = 30 * 24 * 60 * 60 * 1000;

function isExpired(expiresAt?: string): boolean {
    if (!expiresAt) {
        return false;
    }
    const expiresAtMs = Date.parse(expiresAt);
    if (Number.isNaN(expiresAtMs)) {
        return false;
    }
    return Date.now() >= expiresAtMs;
}

function isValidBounds(value: string): boolean {
    const parts = value.split(",").map((part) => Number(part.trim()));

    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
        return false;
    }

    const [minLng, minLat, maxLng, maxLat] = parts;

    return (
        minLng >= -180 &&
        maxLng <= 180 &&
        minLat >= -90 &&
        maxLat <= 90 &&
        minLng < maxLng &&
        minLat < maxLat
    );
}

function toLeafletFitBounds(extentBBox: [number, number, number, number]): [number, number, number, number] {
    return [
        extentBBox[1],
        extentBBox[0],
        extentBBox[3],
        extentBBox[2],
    ];
}

function toExportBoundsFromMapBounds(mapBounds: string): string {
    const parts = mapBounds.split(",").map((part) => Number(part.trim()));
    if (parts.length !== 4 || parts.some((part) => Number.isNaN(part))) {
        return mapBounds;
    }

    const [south, west, north, east] = parts;
    return `${west},${south},${east},${north}`;
}

function isValidAllCrisesDateRange(dateFrom: string, dateTo: string, format: ExportFormat): boolean {
    const fromMs = Date.parse(dateFrom);
    const toMs = Date.parse(dateTo);

    if (Number.isNaN(fromMs) || Number.isNaN(toMs) || toMs < fromMs) {
        return false;
    }

    const maxRangeMs = format === "shapefile"
        ? ALL_CRISES_SHAPEFILE_MAX_RANGE_MS
        : ALL_CRISES_STREAMING_MAX_RANGE_MS;

    return toMs - fromMs <= maxRangeMs;
}

export default function DashboardExportPage() {
    const { t } = useTranslation();
    const { data: session } = useSession();
    const isAdmin = session?.user?.role?.trim().toLowerCase() === "admin";

    const [crisisId, setCrisisId] = useState<string | null>(null);
    const [format, setFormat] = useState<ExportFormat>("csv");
    const [dateFrom, setDateFrom] = useState("");
    const [dateTo, setDateTo] = useState("");
    const [bounds, setBounds] = useState("");
    const [viewportBounds, setViewportBounds] = useState("");
    const [isViewportLinked, setIsViewportLinked] = useState(true);
    const [fitBounds, setFitBounds] = useState<[number, number, number, number] | null>(null);
    const [jobs, setJobs] = useState<ExportJobView[]>([]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);

    const pollTimersRef = useRef<Record<string, number>>({});

    const setJobStatus = (jobId: string, status: ExportJobStatus, request: CreateExportRequest) => {
        setJobs((prev) => {
            const next = prev.map((job) =>
                job.jobId === jobId
                    ? {
                        ...job,
                        status: status.status,
                        url: status.url,
                        expiresAt: status.expiresAt,
                        request,
                    }
                    : job,
            );
            return next;
        });
    };

    const pollJob = async (jobId: string, request: CreateExportRequest) => {
        const status = await apiClient.reports.exportStatus(jobId);
        setJobStatus(jobId, status, request);

        if (TERMINAL_STATUSES.has(status.status)) {
            delete pollTimersRef.current[jobId];
            return;
        }

        const timer = window.setTimeout(() => {
            void pollJob(jobId, request);
        }, 3000);
        pollTimersRef.current[jobId] = timer;
    };

    const submitExport = async (req: CreateExportRequest) => {
        const queued = await apiClient.reports.export(req);

        setJobs((prev) => [
            {
                jobId: queued.jobId,
                status: "queued" as const,
                request: req,
            },
            ...prev,
        ].slice(0, 5));

        await pollJob(queued.jobId, req);
    };

    const onSubmit = async () => {
        if (!crisisId) {
            if (!isAdmin) {
                setFormError("dashboard.export.errors.crisis_required");
                return;
            }

            if (!dateFrom || !dateTo) {
                setFormError("dashboard.export.errors.all_crises_date_range_required");
                return;
            }

            if (!isValidAllCrisesDateRange(dateFrom, dateTo, format)) {
                setFormError(
                    format === "shapefile"
                        ? "dashboard.export.errors.all_crises_date_range_max_shapefile_30_days"
                        : "dashboard.export.errors.all_crises_date_range_max_streaming_365_days",
                );
                return;
            }
        }

        if (bounds && !isValidBounds(bounds)) {
            setFormError("dashboard.export.errors.bounds_invalid");
            return;
        }

        setFormError(null);
        setIsSubmitting(true);

        const req: CreateExportRequest = {
            format,
            ...(crisisId ? { crisisId } : {}),
            ...(dateFrom ? { dateFrom } : {}),
            ...(dateTo ? { dateTo } : {}),
            ...(bounds ? { bounds } : {}),
        };

        try {
            await submitExport(req);
        } finally {
            setIsSubmitting(false);
        }
    };

    const onUseCurrentExtent = () => {
        if (!viewportBounds) return;
        setIsViewportLinked(true);
        setBounds(viewportBounds);
        setFormError(null);
    };

    useEffect(() => {
        const timers = pollTimersRef.current;
        return () => {
            Object.values(timers).forEach((timer) => {
                window.clearTimeout(timer);
            });
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        if (!crisisId) {
            setFitBounds(null);
            return;
        }

        const getCrisisById = apiClient.crises?.getById;
        if (typeof getCrisisById !== "function") {
            setFitBounds(null);
            return;
        }

        void (async () => {
            const crisis = await getCrisisById(crisisId);
            if (cancelled) return;

            if (crisis.extentBBox && crisis.extentBBox.length === 4) {
                setFitBounds(toLeafletFitBounds(crisis.extentBBox as [number, number, number, number]));
                return;
            }

            setFitBounds(null);
        })();

        return () => {
            cancelled = true;
        };
    }, [crisisId]);

    useEffect(() => {
        if (!isViewportLinked || !viewportBounds) return;
        setBounds(viewportBounds);
    }, [isViewportLinked, viewportBounds]);

    return (
        <div className="flex h-full min-h-0 flex-col gap-4 p-6" data-density="operations">
            <h1 className="text-lg font-semibold text-foreground">{t("dashboard.nav.export")}</h1>

            <section className="rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-medium text-foreground">{t("dashboard.export.form_title")}</h2>

                <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
                    <div className="min-w-0">
                        <p className="mb-1 text-xs text-muted-foreground">{t("dashboard.map.crisis_selector_label")}</p>
                        <CrisisSelector selectedId={crisisId} onSelect={setCrisisId} variant="inline" />
                        {isAdmin ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t("dashboard.export.all_crises_selector_hint")}
                            </p>
                        ) : null}
                    </div>

                    <div className="min-w-0">
                        <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <label htmlFor="export-format">{t("dashboard.export.fields.format")}</label>
                            {isAdmin ? (
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={t("dashboard.export.all_crises_limits_tooltip_label")}
                                                className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                            >
                                                <CircleHelp aria-hidden="true" className="size-3.5" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent className="max-w-64 text-start">
                                            {t("dashboard.export.all_crises_limits_tooltip")}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            ) : null}
                        </div>
                        <select
                            id="export-format"
                            value={format}
                            onChange={(e) => setFormat(e.target.value as ExportFormat)}
                            className="flex h-8 w-full rounded-md border border-input bg-background px-2 text-xs"
                        >
                            <option value="csv">{t("dashboard.analytics.export_csv")}</option>
                            <option value="geojson">{t("dashboard.analytics.export_geojson")}</option>
                            <option value="shapefile">{t("dashboard.analytics.export_shapefile")}</option>
                        </select>
                        {isAdmin ? (
                            <p className="mt-1 text-xs text-muted-foreground">
                                {t("dashboard.export.all_crises_limits_hint")}
                            </p>
                        ) : null}
                    </div>

                    <div className="min-w-0">
                        <label htmlFor="export-date-from" className="mb-1 block text-xs text-muted-foreground">
                            {t("dashboard.export.fields.date_from")}
                        </label>
                        <Input
                            id="export-date-from"
                            type="datetime-local"
                            value={dateFrom}
                            onChange={(e) => setDateFrom(e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>

                    <div className="min-w-0">
                        <label htmlFor="export-date-to" className="mb-1 block text-xs text-muted-foreground">
                            {t("dashboard.export.fields.date_to")}
                        </label>
                        <Input
                            id="export-date-to"
                            type="datetime-local"
                            value={dateTo}
                            onChange={(e) => setDateTo(e.target.value)}
                            className="h-8 text-xs"
                        />
                    </div>

                    <div className="min-w-0 md:col-span-2">
                        <div className="mb-1 flex items-center gap-1 text-xs text-muted-foreground">
                            <label htmlFor="export-bounds">{t("dashboard.export.fields.bounds")}</label>
                            {isViewportLinked && viewportBounds && (
                                <span className="rounded bg-primary/10 px-1 py-0.5 text-[10px] font-medium text-primary">
                                    {t("dashboard.export.bounds_live_badge")}
                                </span>
                            )}
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label={t("dashboard.export.bounds_tooltip_label")}
                                            className="inline-flex size-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                                        >
                                            <CircleHelp aria-hidden="true" className="size-3.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent className="max-w-64 text-start">
                                        {t("dashboard.export.bounds_tooltip")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <Input
                            id="export-bounds"
                            value={bounds}
                            onChange={(e) => {
                                setBounds(e.target.value);
                                setIsViewportLinked(false);
                            }}
                            placeholder={t("dashboard.export.bounds_placeholder")}
                            aria-describedby="export-bounds-help"
                            aria-invalid={formError === "dashboard.export.errors.bounds_invalid"}
                            className="h-8 text-xs"
                        />
                        <p id="export-bounds-help" className="mt-1 text-xs text-muted-foreground">
                            {t("dashboard.export.bounds_help")}
                        </p>
                        <div className="relative mt-2 overflow-hidden rounded-md border border-border">
                            <ExportViewportMap
                                onBoundsChange={(mapBounds) => {
                                    const exportBounds = toExportBoundsFromMapBounds(mapBounds);
                                    setViewportBounds(exportBounds);
                                    if (isViewportLinked) {
                                        setBounds(exportBounds);
                                    }
                                }}
                                fitBounds={fitBounds}
                            />
                            {/* Step callouts anchored to the top-start corner of the map */}
                            <div className="pointer-events-none absolute start-2 top-2 z-[400] flex flex-col gap-1">
                                <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                                    {t("dashboard.export.map_step1")}
                                </span>
                                <span className="rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-foreground shadow-sm">
                                    {t("dashboard.export.map_step2")}
                                </span>
                            </div>
                        </div>
                        <div className="mt-2">
                            <Button
                                type="button"
                                variant="outline"
                                className="h-7 px-2 text-xs"
                                onClick={onUseCurrentExtent}
                            >
                                {t("dashboard.export.use_current_extent")}
                            </Button>
                        </div>
                    </div>
                </div>

                {formError ? (
                    <p className="mt-2 text-xs text-destructive" role="alert">
                        {t(formError)}
                    </p>
                ) : null}

                <div className="mt-3">
                    <Button type="button" className="h-8" onClick={() => void onSubmit()} disabled={isSubmitting}>
                        {t("dashboard.export.submit")}
                    </Button>
                </div>
            </section>

            <section className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-card p-4">
                <h2 className="text-sm font-medium text-foreground">{t("dashboard.export.recent_title")}</h2>

                {jobs.length === 0 ? (
                    <p className="mt-3 text-xs text-muted-foreground">{t("dashboard.export.empty")}</p>
                ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                        {jobs.map((job) => {
                            const expired = job.status === "completed" && isExpired(job.expiresAt);
                            const statusKey = expired
                                ? "dashboard.export.status.expired"
                                : `dashboard.export.status.${job.status}`;
                            return (
                                <li
                                    key={job.jobId}
                                    data-testid={`export-job-${job.jobId}`}
                                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3"
                                >
                                    <div className="min-w-0">
                                        <p className="text-xs font-medium text-foreground">
                                            {t("dashboard.export.job_id", { id: job.jobId })}
                                        </p>
                                        <p className="text-xs text-muted-foreground">{t(statusKey)}</p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        {job.status === "completed" && job.url && !expired ? (
                                            <a
                                                href={job.url}
                                                className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                                                target="_blank"
                                                rel="noreferrer"
                                            >
                                                {t("dashboard.export.download")}
                                            </a>
                                        ) : null}
                                        {expired || job.status === "failed" ? (
                                            <Button
                                                type="button"
                                                variant="outline"
                                                className="h-7 px-2 text-xs"
                                                onClick={() => void submitExport(job.request)}
                                            >
                                                {t("dashboard.export.reexport")}
                                            </Button>
                                        ) : null}
                                    </div>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </section>
        </div>
    );
}
