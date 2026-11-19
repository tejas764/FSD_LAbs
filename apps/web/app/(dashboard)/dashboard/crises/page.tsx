"use client";

import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus, PowerOff, Power, Loader2, Pencil, Trash2, ArrowUpDown, CircleHelp } from "lucide-react";
import { TablePaginationControls } from "@/components/composed/table-pagination-controls";
import { runOptimisticToastMutation, runToastMutation } from "@/lib/optimistic-toast";
import { formatDateForDisplay } from "@/lib/date-format";

import { useSession } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CrisisSelector } from "@/components/composed/crisis-selector";
import { CountryCodeSelect } from "@/components/composed/country-code-select";
import {
    DashboardDataTable,
    DashboardDataTableBody,
    DashboardDataTableCell,
    DashboardDataTableHead,
    DashboardDataTableHeader,
    DashboardDataTableRow,
} from "@/components/composed/dashboard-data-table";
import { apiClient, type Crisis, type CrisisType, type CreateCrisisBody } from "@/lib/api/client";

// ─── sort helpers ─────────────────────────────────────────────────────────────

type SortKey = "name" | "startedAt";
type SortDir = "asc" | "desc";
type ModularSortKey = "fieldKey" | "infraType";
type ModularFieldType = "string" | "number" | "boolean";
type ModularFieldRow = { id: string; fieldKey: string; infraType: string; fieldType: ModularFieldType; required: boolean };

function sortCrises(list: Crisis[], key: SortKey, dir: SortDir): Crisis[] {
    return [...list].sort((a, b) => {
        const av = key === "name" ? a.name : a.startedAt;
        const bv = key === "name" ? b.name : b.startedAt;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === "asc" ? cmp : -cmp;
    });
}

function sortModularFields(
    list: ModularFieldRow[],
    key: ModularSortKey,
    dir: SortDir,
): ModularFieldRow[] {
    return [...list].sort((a, b) => {
        const av = key === "fieldKey" ? a.fieldKey : a.infraType;
        const bv = key === "fieldKey" ? b.fieldKey : b.infraType;
        const cmp = av < bv ? -1 : av > bv ? 1 : 0;
        return dir === "asc" ? cmp : -cmp;
    });
}

// ─── constants ────────────────────────────────────────────────────────────────

const CRISIS_TYPES: CrisisType[] = [
    "EARTHQUAKE",
    "FLOOD",
    "TSUNAMI",
    "HURRICANE_CYCLONE",
    "WILDFIRE",
    "EXPLOSION",
    "CHEMICAL_INCIDENT",
    "CONFLICT",
    "CIVIL_UNREST",
];

const INFRA_TYPES = [
    "RESIDENTIAL",
    "COMMERCIAL",
    "GOVERNMENT",
    "UTILITY",
    "TRANSPORT_COMMUNICATION",
    "COMMUNITY",
    "PUBLIC_RECREATION",
    "OTHER",
] as const;

// ─── create / edit form ───────────────────────────────────────────────────────

interface CrisisFormData {
    name: string;
    type: CrisisType | "";
    country: string;
    region: string;
    startedAt: string;
    endedAt: string;
    description: string;
}

const EMPTY_FORM: CrisisFormData = {
    name: "",
    type: "",
    country: "",
    region: "",
    startedAt: new Date().toISOString().slice(0, 10),
    endedAt: "",
    description: "",
};

interface CrisisFormDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    titleKey: string;
    submitKey: string;
    onSubmit: (data: CreateCrisisBody) => Promise<void>;
    submitting: boolean;
    initialData?: CrisisFormData;
}

function CrisisFormDialog({
    open,
    onOpenChange,
    titleKey,
    submitKey,
    onSubmit,
    submitting,
    initialData,
}: CrisisFormDialogProps) {
    const { t } = useTranslation();
    const [form, setForm] = useState<CrisisFormData>(initialData ?? EMPTY_FORM);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!form.type) return;
        await onSubmit({
            name: form.name,
            type: form.type as CrisisType,
            country: form.country,
            region: form.region || undefined,
            startedAt: new Date(form.startedAt).toISOString(),
            endedAt: form.endedAt ? new Date(form.endedAt).toISOString() : undefined,
            description: form.description.trim() || undefined,
        });
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>{t(titleKey)}</DialogTitle>
                    <DialogDescription className="sr-only">
                        {t("dashboard.crises.form.name")}
                    </DialogDescription>
                </DialogHeader>

                <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
                    <div data-testid="crisis-form-grid" className="grid grid-cols-1 gap-4 md:grid-cols-2">
                        {/* Name */}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="crisis-name">{t("dashboard.crises.form.name")}</Label>
                            <Input
                                id="crisis-name"
                                aria-label={t("dashboard.crises.form.name")}
                                value={form.name}
                                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                                required
                            />
                        </div>

                        {/* Type */}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="crisis-type">{t("dashboard.crises.form.type")}</Label>
                            <Select
                                value={form.type}
                                onValueChange={(v) => setForm((f) => ({ ...f, type: v as CrisisType }))}
                            >
                                <SelectTrigger id="crisis-type" aria-label={t("dashboard.crises.form.type")}>
                                    <SelectValue placeholder={t("dashboard.crises.form.type")} />
                                </SelectTrigger>
                                <SelectContent>
                                    {CRISIS_TYPES.map((type) => (
                                        <SelectItem key={type} value={type}>
                                            {t(`wizard.option.crisis.${type}` as `wizard.option.crisis.${string}`, { defaultValue: type })}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        {/* Country */}
                        <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1.5">
                                <Label htmlFor="crisis-country">{t("dashboard.crises.form.country")}</Label>
                                <TooltipProvider>
                                    <Tooltip>
                                        <TooltipTrigger asChild>
                                            <button
                                                type="button"
                                                aria-label={t("dashboard.crises.form.country_help")}
                                                className="text-muted-foreground hover:text-foreground"
                                            >
                                                <CircleHelp aria-hidden="true" className="size-3.5" />
                                            </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top">
                                            {t("dashboard.crises.form.country_help")}
                                        </TooltipContent>
                                    </Tooltip>
                                </TooltipProvider>
                            </div>
                            <CountryCodeSelect
                                id="crisis-country"
                                ariaLabel={t("dashboard.crises.form.country")}
                                placeholder={t("dashboard.crises.form.country_placeholder")}
                                value={form.country}
                                onChange={(value) => setForm((f) => ({ ...f, country: value }))}
                            />
                        </div>

                        {/* Region (optional) */}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="crisis-region">{t("dashboard.crises.form.region")}</Label>
                            <Input
                                id="crisis-region"
                                aria-label={t("dashboard.crises.form.region")}
                                value={form.region}
                                onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                            />
                        </div>

                        {/* Start date */}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="crisis-started-at">{t("dashboard.crises.form.started_at")}</Label>
                            <Input
                                id="crisis-started-at"
                                aria-label={t("dashboard.crises.form.started_at")}
                                type="date"
                                value={form.startedAt}
                                onChange={(e) => setForm((f) => ({ ...f, startedAt: e.target.value }))}
                                required
                            />
                        </div>

                        {/* End date (optional) */}
                        <div className="flex flex-col gap-1.5">
                            <Label htmlFor="crisis-ended-at">{t("dashboard.crises.form.ended_at")}</Label>
                            <Input
                                id="crisis-ended-at"
                                aria-label={t("dashboard.crises.form.ended_at")}
                                type="date"
                                value={form.endedAt}
                                onChange={(e) => setForm((f) => ({ ...f, endedAt: e.target.value }))}
                            />
                        </div>

                        {/* Description (optional) */}
                        <div className="flex flex-col gap-1.5 md:col-span-2">
                            <Label htmlFor="crisis-description">{t("dashboard.crises.form.description")}</Label>
                            <Input
                                id="crisis-description"
                                aria-label={t("dashboard.crises.form.description")}
                                value={form.description}
                                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                            />
                        </div>
                    </div>

                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
                            disabled={submitting}
                        >
                            {t("dashboard.crises.form.cancel")}
                        </Button>
                        <Button type="submit" disabled={submitting}>
                            {submitting && (
                                <Loader2 aria-hidden="true" className="me-1.5 size-4 animate-spin" />
                            )}
                            {t(submitKey)}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

// ─── crisis row ───────────────────────────────────────────────────────────────

interface CrisisRowProps {
    crisis: Crisis;
    onEdit: (crisis: Crisis) => void;
    onToggle: (crisis: Crisis) => void;
    toggling: boolean;
    canManage: boolean;
}

function CrisisRow({ crisis, onEdit, onToggle, toggling, canManage }: CrisisRowProps) {
    const { t, i18n } = useTranslation();
    const toggleLabel = crisis.isActive ? t("dashboard.crises.deactivate") : t("dashboard.crises.activate");

    return (
        <DashboardDataTableRow>
            <DashboardDataTableCell>
                <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium text-foreground">{crisis.name}</span>
                    <span className="text-xs text-muted-foreground">
                        {crisis.country}
                        {crisis.region ? ` · ${crisis.region}` : ""}
                    </span>
                </div>
            </DashboardDataTableCell>
            <DashboardDataTableCell>
                {t(`wizard.option.crisis.${crisis.type}` as `wizard.option.crisis.${string}`, { defaultValue: crisis.type })}
            </DashboardDataTableCell>
            <DashboardDataTableCell className="whitespace-nowrap">
                {formatDateForDisplay(crisis.startedAt, i18n?.language)}
            </DashboardDataTableCell>
            <DashboardDataTableCell>
                <Badge variant={crisis.isActive ? "default" : "secondary"}>
                    {crisis.isActive
                        ? t("dashboard.users.status_active")
                        : t("dashboard.users.status_deactivated")}
                </Badge>
            </DashboardDataTableCell>
            <DashboardDataTableCell>
                <TooltipProvider>
                    <div className="flex shrink-0 items-center gap-1.5">
                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-xs"
                                    onClick={() => onEdit(crisis)}
                                    disabled={toggling || !canManage}
                                    aria-label={`${t("dashboard.crises.edit")} ${crisis.name}`}
                                >
                                    <Pencil aria-hidden="true" />
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{t("dashboard.crises.edit")}</TooltipContent>
                        </Tooltip>

                        <Tooltip>
                            <TooltipTrigger asChild>
                                <Button
                                    type="button"
                                    variant="outline"
                                    size="icon-xs"
                                    onClick={() => onToggle(crisis)}
                                    disabled={toggling || !canManage}
                                    aria-label={`${toggleLabel} ${crisis.name}`}
                                >
                                    {toggling ? (
                                        <Loader2 aria-hidden="true" className="animate-spin" />
                                    ) : crisis.isActive ? (
                                        <PowerOff aria-hidden="true" />
                                    ) : (
                                        <Power aria-hidden="true" />
                                    )}
                                </Button>
                            </TooltipTrigger>
                            <TooltipContent side="top">{toggleLabel}</TooltipContent>
                        </Tooltip>
                    </div>
                </TooltipProvider>
            </DashboardDataTableCell>
        </DashboardDataTableRow>
    );
}

// ─── page ─────────────────────────────────────────────────────────────────────

export default function CrisesPage() {
    const { t } = useTranslation();
    const { data: session } = useSession();
    const role = session?.user?.role?.trim().toLowerCase();
    const canManage = role === "admin" || role == null;
    const [crises, setCrises] = useState<Crisis[]>([]);
    const [loading, setLoading] = useState(true);
    const [activeTab, setActiveTab] = useState<"active" | "archived">("active");
    const [sortKey, setSortKey] = useState<SortKey>("startedAt");
    const [sortDir, setSortDir] = useState<SortDir>("desc");
    const [pageIdx, setPageIdx] = useState(0);
    const [pageSize, setPageSize] = useState(20);
    const [createOpen, setCreateOpen] = useState(false);
    const [createDialogVersion, setCreateDialogVersion] = useState(0);
    const [editingCrisis, setEditingCrisis] = useState<Crisis | null>(null);
    const [deactivateTarget, setDeactivateTarget] = useState<Crisis | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const [modularCrisisId, setModularCrisisId] = useState<string>("");
    const [modularInfraType, setModularInfraType] = useState<string>("RESIDENTIAL");
    const [modularFieldKey, setModularFieldKey] = useState("");
    const [modularFieldType, setModularFieldType] = useState<ModularFieldType>("string");
    const [modularRequired, setModularRequired] = useState(true);
    const [modularLoading, setModularLoading] = useState(false);
    const [modularItems, setModularItems] = useState<ModularFieldRow[]>([]);
    const [modularSortKey, setModularSortKey] = useState<ModularSortKey>("fieldKey");
    const [modularSortDir, setModularSortDir] = useState<SortDir>("desc");
    const [modularDeleteTarget, setModularDeleteTarget] = useState<{ id: string; fieldKey: string } | null>(null);

    const loadCrises = useCallback(async () => {
        setLoading(true);
        try {
            const data = await apiClient.crises.list();
            setCrises(data);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadCrises();
    }, [loadCrises]);

    const loadModularFields = useCallback(async () => {
        if (!modularCrisisId) {
            setModularItems([]);
            return;
        }

        setModularLoading(true);
        try {
            const result = await apiClient.crises.listModularFields(modularCrisisId);
            setModularItems(
                result.data.map((item) => ({
                    id: item.id,
                    fieldKey: item.fieldKey,
                    infraType: item.infraType,
                    fieldType: item.fieldType,
                    required: item.required,
                })),
            );
        } finally {
            setModularLoading(false);
        }
    }, [modularCrisisId]);

    useEffect(() => {
        void loadModularFields();
    }, [loadModularFields]);

    const handleCreate = useCallback(
        async (data: CreateCrisisBody) => {
            setSubmitting(true);
            try {
                const created = await runToastMutation({
                    commit: () => apiClient.crises.create(data),
                    successMessage: t("dashboard.crises.toast_create_success"),
                    errorMessage: t("dashboard.crises.toast_create_error"),
                });

                if (created) {
                    setCreateOpen(false);
                    setCrises((prev) => [created.data, ...prev]);
                }
            } finally {
                setSubmitting(false);
            }
        },
        [t],
    );

    const handleToggle = useCallback(
        async (crisis: Crisis) => {
            if (crisis.isActive) {
                setDeactivateTarget(crisis);
                return;
            }

            setTogglingId(crisis.id);
            try {
                const previous = crises;
                await runOptimisticToastMutation({
                    getSnapshot: () => previous,
                    applyOptimistic: () => {
                        setCrises((prev) => prev.map((item) => (
                            item.id === crisis.id ? { ...item, isActive: true } : item
                        )));
                    },
                    commit: () => apiClient.crises.update(crisis.id, { isActive: true }).then(() => undefined),
                    rollback: (snapshot) => setCrises(snapshot),
                    successMessage: t("dashboard.crises.toast_activate_success"),
                    errorMessage: t("dashboard.crises.toast_activate_error"),
                });
            } finally {
                setTogglingId(null);
            }
        },
        [crises, t],
    );

    const handleDeactivateConfirm = useCallback(async () => {
        if (!deactivateTarget) return;
        setTogglingId(deactivateTarget.id);
        try {
            const previous = crises;
            const ok = await runOptimisticToastMutation({
                getSnapshot: () => previous,
                applyOptimistic: () => {
                    setCrises((prev) => prev.map((item) => (
                        item.id === deactivateTarget.id ? { ...item, isActive: false } : item
                    )));
                },
                commit: () => apiClient.crises.update(deactivateTarget.id, { isActive: false }).then(() => undefined),
                rollback: (snapshot) => setCrises(snapshot),
                successMessage: t("dashboard.crises.toast_deactivate_success"),
                errorMessage: t("dashboard.crises.toast_deactivate_error"),
            });

            if (!ok) {
                return;
            }
            setDeactivateTarget(null);
        } finally {
            setTogglingId(null);
        }
    }, [crises, deactivateTarget, t]);

    const handleEdit = useCallback((crisis: Crisis) => {
        setEditingCrisis(crisis);
    }, []);

    const handleEditSubmit = useCallback(
        async (data: CreateCrisisBody) => {
            if (!editingCrisis) return;
            setSubmitting(true);
            try {
                const previous = crises;
                const ok = await runOptimisticToastMutation({
                    getSnapshot: () => previous,
                    applyOptimistic: () => {
                        setCrises((prev) => prev.map((item) => (
                            item.id === editingCrisis.id
                                ? {
                                    ...item,
                                    name: data.name,
                                    region: data.region ?? null,
                                    startedAt: data.startedAt,
                                    endedAt: data.endedAt ?? null,
                                    description: data.description ?? null,
                                }
                                : item
                        )));
                    },
                    commit: () => apiClient.crises.update(editingCrisis.id, {
                        name: data.name,
                        region: data.region,
                        startedAt: data.startedAt,
                        endedAt: data.endedAt,
                        description: data.description,
                    }).then(() => undefined),
                    rollback: (snapshot) => setCrises(snapshot),
                    successMessage: t("dashboard.crises.toast_update_success"),
                    errorMessage: t("dashboard.crises.toast_update_error"),
                });

                if (!ok) {
                    return;
                }

                setEditingCrisis(null);
            } finally {
                setSubmitting(false);
            }
        },
        [crises, editingCrisis, t],
    );

    const handleCreateModularField = useCallback(async () => {
        if (!modularCrisisId || !modularFieldKey.trim()) return;
        setModularLoading(true);
        try {
            const created = await runToastMutation({
                commit: () => apiClient.crises.createModularField({
                    crisisId: modularCrisisId,
                    infraType: modularInfraType as (typeof INFRA_TYPES)[number],
                    fieldKey: modularFieldKey.trim(),
                    fieldType: modularFieldType,
                    required: modularRequired,
                    labels: { en: modularFieldKey.trim() },
                }),
                successMessage: t("dashboard.crises.modular.toast_create_success"),
                errorMessage: t("dashboard.crises.modular.toast_create_error"),
            });

            if (!created) {
                return;
            }

            setModularItems((prev) => [
                {
                    id: created.data.id,
                    fieldKey: created.data.fieldKey,
                    infraType: created.data.infraType,
                    fieldType: created.data.fieldType,
                    required: created.data.required,
                },
                ...prev,
            ]);
            setModularFieldKey("");
        } finally {
            setModularLoading(false);
        }
    }, [modularCrisisId, modularFieldKey, modularFieldType, modularInfraType, modularRequired, t]);

    const handleConfirmDeleteModularField = useCallback(async () => {
        if (!modularDeleteTarget) return;
        setModularLoading(true);
        try {
            const previous = modularItems;
            const ok = await runOptimisticToastMutation({
                getSnapshot: () => previous,
                applyOptimistic: () => {
                    setModularItems((prev) => prev.filter((item) => item.id !== modularDeleteTarget.id));
                },
                commit: () => apiClient.crises.deleteModularField(modularDeleteTarget.id),
                rollback: (snapshot) => setModularItems(snapshot),
                successMessage: t("dashboard.crises.modular.toast_delete_success"),
                errorMessage: t("dashboard.crises.modular.toast_delete_error"),
            });

            if (!ok) {
                return;
            }

            setModularDeleteTarget(null);
        } finally {
            setModularLoading(false);
        }
    }, [modularDeleteTarget, modularItems, t]);

    const handleModularSort = useCallback((key: ModularSortKey) => {
        setModularSortDir((d) => (modularSortKey === key ? (d === "asc" ? "desc" : "asc") : "desc"));
        setModularSortKey(key);
    }, [modularSortKey]);

    const handleSort = useCallback((key: SortKey) => {
        setSortDir((d) => (sortKey === key ? (d === "asc" ? "desc" : "asc") : "desc"));
        setSortKey(key);
        setPageIdx(0);
    }, [sortKey]);

    const filteredCrises = sortCrises(
        crises.filter((crisis) => (activeTab === "active" ? crisis.isActive : !crisis.isActive)),
        sortKey,
        sortDir,
    );
    const sortedModularItems = sortModularFields(modularItems, modularSortKey, modularSortDir);
    const totalPages = Math.max(1, Math.ceil(filteredCrises.length / pageSize));
    const pagedCrises = filteredCrises.slice(pageIdx * pageSize, (pageIdx + 1) * pageSize);

    const editInitialData: CrisisFormData | undefined = editingCrisis
        ? {
            name: editingCrisis.name,
            type: editingCrisis.type,
            country: editingCrisis.country,
            region: editingCrisis.region ?? "",
            startedAt: editingCrisis.startedAt.slice(0, 10),
            endedAt: editingCrisis.endedAt ? editingCrisis.endedAt.slice(0, 10) : "",
            description: editingCrisis.description ?? "",
        }
        : undefined;

    return (
        <section className="flex h-full min-h-0 flex-col gap-4 p-6" data-density="operations">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-foreground">
                    {t("dashboard.crises.title")}
                </h2>
                <Button
                    onClick={() => {
                        setCreateDialogVersion((v) => v + 1);
                        setCreateOpen(true);
                    }}
                    disabled={!canManage}
                >
                    <Plus aria-hidden="true" className="me-1.5 size-4" />
                    {t("dashboard.crises.create")}
                </Button>
            </div>

            {/* Crises list */}
            <div className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-4 py-3">
                    <Tabs value={activeTab} onValueChange={(value) => {
                        setActiveTab(value as "active" | "archived");
                        setPageIdx(0);
                    }}>
                        <TabsList aria-label={t("dashboard.crises.title")}>
                            <TabsTrigger value="active">{t("dashboard.crises.tab_active")}</TabsTrigger>
                            <TabsTrigger value="archived">{t("dashboard.crises.tab_archived")}</TabsTrigger>
                        </TabsList>
                    </Tabs>
                </div>
                {loading ? (
                    <div
                        role="status"
                        aria-label={t("reporter.wizard.fields.crisis_loading")}
                        className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
                    >
                        <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        {t("reporter.wizard.fields.crisis_loading")}
                    </div>
                ) : (
                    <>
                        <DashboardDataTable className="w-full" testId="dashboard-data-table">
                            <DashboardDataTableHeader>
                                <DashboardDataTableRow>
                                    <DashboardDataTableHead>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1 text-xs font-semibold"
                                            onClick={() => handleSort("name")}
                                        >
                                            {t("dashboard.crises.form.name")}
                                            <ArrowUpDown aria-hidden="true" className="size-3" />
                                        </button>
                                    </DashboardDataTableHead>
                                    <DashboardDataTableHead>{t("dashboard.crises.form.type")}</DashboardDataTableHead>
                                    <DashboardDataTableHead>
                                        <button
                                            type="button"
                                            className="flex items-center gap-1 text-xs font-semibold"
                                            onClick={() => handleSort("startedAt")}
                                        >
                                            {t("dashboard.crises.form.started_at")}
                                            <ArrowUpDown aria-hidden="true" className="size-3" />
                                        </button>
                                    </DashboardDataTableHead>
                                    <DashboardDataTableHead>{t("dashboard.users.table_status")}</DashboardDataTableHead>
                                    <DashboardDataTableHead>{t("dashboard.overview.table_col_actions")}</DashboardDataTableHead>
                                </DashboardDataTableRow>
                            </DashboardDataTableHeader>
                            <DashboardDataTableBody>
                                {filteredCrises.length === 0 ? (
                                    <DashboardDataTableRow>
                                        <DashboardDataTableCell colSpan={5} className="py-8 text-center">
                                            {t("dashboard.crises.no_crises")}
                                        </DashboardDataTableCell>
                                    </DashboardDataTableRow>
                                ) : (
                                    pagedCrises.map((crisis) => (
                                        <CrisisRow
                                            key={crisis.id}
                                            crisis={crisis}
                                            onEdit={handleEdit}
                                            onToggle={(c) => void handleToggle(c)}
                                            toggling={togglingId === crisis.id}
                                            canManage={canManage}
                                        />
                                    ))
                                )}
                            </DashboardDataTableBody>
                        </DashboardDataTable>
                        <TablePaginationControls
                            page={pageIdx + 1}
                            total={totalPages}
                            canGoPrev={pageIdx > 0}
                            canGoNext={pageIdx < totalPages - 1}
                            onPrev={() => setPageIdx((i) => i - 1)}
                            onNext={() => setPageIdx((i) => i + 1)}
                            pageSize={pageSize}
                            onPageSizeChange={(s) => {
                                setPageSize(s);
                                setPageIdx(0);
                            }}
                        />
                    </>
                )}
            </div>

            {/* Modular fields */}
            <div className="rounded-lg border border-border bg-card p-4">
                <h3 className="mb-3 text-sm font-semibold text-foreground">
                    {t("dashboard.crises.modular.title")}
                </h3>

                <div className="grid grid-cols-1 gap-3 lg:grid-cols-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="modular-crisis">{t("dashboard.crises.modular.crisis")}</Label>
                        <CrisisSelector
                            selectedId={modularCrisisId || null}
                            onSelect={(id) => setModularCrisisId(id ?? "")}
                            variant="inline"
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="modular-infra">{t("dashboard.crises.modular.infra_type")}</Label>
                        <Select value={modularInfraType} onValueChange={setModularInfraType}>
                            <SelectTrigger
                                id="modular-infra"
                                aria-label={t("dashboard.crises.modular.infra_type")}
                                className="h-8 text-xs"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {INFRA_TYPES.map((type) => (
                                    <SelectItem key={type} value={type}>
                                        {t(`wizard.option.infra.${type}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <div className="flex items-center gap-1.5">
                            <Label htmlFor="modular-key">{t("dashboard.crises.modular.field_key")}</Label>
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <button
                                            type="button"
                                            aria-label={t("wizard.help.dynamic_fields")}
                                            className="text-muted-foreground hover:text-foreground"
                                        >
                                            <CircleHelp aria-hidden="true" className="size-3.5" />
                                        </button>
                                    </TooltipTrigger>
                                    <TooltipContent side="top">
                                        {t("wizard.help.dynamic_fields")}
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        </div>
                        <Input
                            id="modular-key"
                            aria-label={t("dashboard.crises.modular.field_key")}
                            className="h-8 text-xs"
                            value={modularFieldKey}
                            onChange={(event) => setModularFieldKey(event.target.value)}
                        />
                    </div>

                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="modular-type">{t("dashboard.crises.modular.field_type")}</Label>
                        <Select value={modularFieldType} onValueChange={(value) => setModularFieldType(value as "string" | "number" | "boolean")}>
                            <SelectTrigger
                                id="modular-type"
                                aria-label={t("dashboard.crises.modular.field_type")}
                                className="h-8 text-xs"
                            >
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="string">{t("dashboard.crises.modular.type_string")}</SelectItem>
                                <SelectItem value="number">{t("dashboard.crises.modular.type_number")}</SelectItem>
                                <SelectItem value="boolean">{t("dashboard.crises.modular.type_boolean")}</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                        <Checkbox
                            id="modular-required"
                            checked={modularRequired}
                            onCheckedChange={(checked) => setModularRequired(checked === true)}
                            aria-label={t("dashboard.crises.modular.required")}
                        />
                        <Label htmlFor="modular-required">{t("dashboard.crises.modular.required")}</Label>
                    </div>
                    <Button type="button" onClick={() => void handleCreateModularField()} disabled={modularLoading || !canManage}>
                        {t("dashboard.crises.modular.add")}
                    </Button>
                </div>

                <div className="mt-4 overflow-hidden rounded-md border border-border">
                    <DashboardDataTable
                        testId="dashboard-modular-fields-table"
                        aria-label={t("dashboard.crises.modular.list")}
                    >
                        <DashboardDataTableHeader>
                            <DashboardDataTableRow>
                                <DashboardDataTableHead>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1 text-xs font-semibold"
                                        onClick={() => handleModularSort("fieldKey")}
                                    >
                                        {t("dashboard.crises.modular.field_key")}
                                        <ArrowUpDown aria-hidden="true" className="size-3" />
                                    </button>
                                </DashboardDataTableHead>
                                <DashboardDataTableHead>
                                    <button
                                        type="button"
                                        className="flex items-center gap-1 text-xs font-semibold"
                                        onClick={() => handleModularSort("infraType")}
                                    >
                                        {t("dashboard.crises.modular.infra_type")}
                                        <ArrowUpDown aria-hidden="true" className="size-3" />
                                    </button>
                                </DashboardDataTableHead>
                                <DashboardDataTableHead>
                                    {t("dashboard.crises.modular.field_type")}
                                </DashboardDataTableHead>
                                <DashboardDataTableHead>
                                    {t("dashboard.crises.modular.required")}
                                </DashboardDataTableHead>
                                <DashboardDataTableHead className="text-end">
                                    {t("dashboard.overview.table_col_actions")}
                                </DashboardDataTableHead>
                            </DashboardDataTableRow>
                        </DashboardDataTableHeader>
                        <DashboardDataTableBody>
                            {!modularCrisisId ? (
                                <DashboardDataTableRow>
                                    <DashboardDataTableCell colSpan={5} className="text-sm text-muted-foreground">
                                        {t("dashboard.crises.modular.select_crisis")}
                                    </DashboardDataTableCell>
                                </DashboardDataTableRow>
                            ) : modularItems.length === 0 ? (
                                <DashboardDataTableRow>
                                    <DashboardDataTableCell colSpan={5} className="text-sm text-muted-foreground">
                                        {t("dashboard.crises.modular.empty")}
                                    </DashboardDataTableCell>
                                </DashboardDataTableRow>
                            ) : (
                                sortedModularItems.map((field) => (
                                    <DashboardDataTableRow key={field.id}>
                                        <DashboardDataTableCell className="text-foreground">
                                            {field.fieldKey}
                                        </DashboardDataTableCell>
                                        <DashboardDataTableCell>
                                            {t(`wizard.option.infra.${field.infraType}` as `wizard.option.infra.${string}`, { defaultValue: field.infraType })}
                                        </DashboardDataTableCell>
                                        <DashboardDataTableCell>
                                            {t(`dashboard.crises.modular.type_${field.fieldType}` as `dashboard.crises.modular.type_${string}`, { defaultValue: field.fieldType })}
                                        </DashboardDataTableCell>
                                        <DashboardDataTableCell>
                                            {field.required ? (
                                                <Badge variant="secondary">{t("dashboard.crises.modular.required")}</Badge>
                                            ) : null}
                                        </DashboardDataTableCell>
                                        <DashboardDataTableCell className="text-end">
                                            <TooltipProvider>
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <Button
                                                            type="button"
                                                            variant="outline"
                                                            size="icon-xs"
                                                            aria-label={`${t("dashboard.crises.modular.delete")} ${field.fieldKey}`}
                                                            disabled={!canManage}
                                                            onClick={() => setModularDeleteTarget({ id: field.id, fieldKey: field.fieldKey })}
                                                        >
                                                            <Trash2 aria-hidden="true" />
                                                        </Button>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">{t("dashboard.crises.modular.delete")}</TooltipContent>
                                                </Tooltip>
                                            </TooltipProvider>
                                        </DashboardDataTableCell>
                                    </DashboardDataTableRow>
                                ))
                            )}
                        </DashboardDataTableBody>
                    </DashboardDataTable>
                </div>
            </div>

            {/* Create dialog */}
            <CrisisFormDialog
                key={createDialogVersion}
                open={createOpen}
                onOpenChange={setCreateOpen}
                titleKey="dashboard.crises.form.submit_create"
                submitKey="dashboard.crises.form.submit_create"
                onSubmit={handleCreate}
                submitting={submitting}
            />

            {/* Edit dialog */}
            <CrisisFormDialog
                key={`${editingCrisis?.id ?? "none"}-${Boolean(editingCrisis)}`}
                open={Boolean(editingCrisis)}
                onOpenChange={(open) => {
                    if (!open) setEditingCrisis(null);
                }}
                titleKey="dashboard.crises.edit"
                submitKey="dashboard.crises.form.submit"
                onSubmit={handleEditSubmit}
                submitting={submitting}
                initialData={editInitialData}
            />

            {/* Deactivate confirmation */}
            <Dialog open={Boolean(deactivateTarget)} onOpenChange={(open) => { if (!open) setDeactivateTarget(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("dashboard.crises.deactivate")}</DialogTitle>
                        <DialogDescription>{t("dashboard.crises.confirm_deactivate")}</DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDeactivateTarget(null)}>
                            {t("dashboard.crises.form.cancel")}
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void handleDeactivateConfirm()}>
                            {t("dashboard.crises.confirm_deactivate_action")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete modular field confirmation */}
            <Dialog open={Boolean(modularDeleteTarget)} onOpenChange={(open) => { if (!open) setModularDeleteTarget(null); }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{t("dashboard.crises.modular.delete")}</DialogTitle>
                        <DialogDescription>
                            {t("dashboard.crises.modular.confirm_delete", { fieldKey: modularDeleteTarget?.fieldKey ?? "" })}
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setModularDeleteTarget(null)}>
                            {t("dashboard.crises.form.cancel")}
                        </Button>
                        <Button type="button" variant="destructive" onClick={() => void handleConfirmDeleteModularField()}>
                            {t("dashboard.crises.modular.confirm_delete_action")}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </section>
    );
}
