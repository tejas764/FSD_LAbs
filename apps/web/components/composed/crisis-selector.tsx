"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown, Globe, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandGroup,
    CommandInput,
    CommandItem,
    CommandList,
    CommandSeparator,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiClient, type Crisis } from "@/lib/api/client";
import { getCountryName } from "@/lib/api/crises-utils";

// ─── props ────────────────────────────────────────────────────────────────────

interface CrisisSelectorProps {
    selectedId: string | null;
    onSelect: (crisisId: string | null) => void;
    onCrisisLoaded?: (crisis: Crisis | null) => void;
    /** "toolbar" (default): full-width bar with border-b bg-card wrapper.
     *  "inline": bare trigger button, no wrapper — for embedding inside headers. */
    variant?: "toolbar" | "inline";
    /** When true and no crisis is pre-selected, auto-select the first active crisis after loading. */
    defaultSelectFirst?: boolean;
}

// ─── component ────────────────────────────────────────────────────────────────

export function CrisisSelector({
    selectedId,
    onSelect,
    onCrisisLoaded,
    variant = "toolbar",
    defaultSelectFirst = false,
}: CrisisSelectorProps) {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const [crises, setCrises] = useState<Crisis[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const data = await apiClient.crises.list(true);
                if (!cancelled) {
                    setCrises(data);
                    if (selectedId && onCrisisLoaded) {
                        const found = data.find((c) => c.id === selectedId) ?? null;
                        onCrisisLoaded(found);
                    }
                    if (!selectedId && defaultSelectFirst && data.length > 0) {
                        onSelect(data[0].id);
                    }
                }
            } catch {
                if (!cancelled) setCrises([]);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Notify parent when selectedId changes
    useEffect(() => {
        if (!onCrisisLoaded) return;
        const found = crises.find((c) => c.id === selectedId) ?? null;
        onCrisisLoaded(found);
    }, [selectedId, crises, onCrisisLoaded]);

    const selectedCrisis = crises.find((c) => c.id === selectedId) ?? null;

    // Group crises by country, sorted alphabetically — keyed by country code for stable grouping
    const grouped = useMemo(() => {
        const groups: Record<string, { label: string; crises: Crisis[] }> = {};
        for (const crisis of crises) {
            const code = crisis.country ?? "";
            const label = code
                ? getCountryName(code, i18n.language)
                : t("reporter.map.crisis_unknown_country");
            if (!groups[code]) groups[code] = { label, crises: [] };
            groups[code].crises.push(crisis);
        }
        return Object.entries(groups).sort(([, a], [, b]) =>
            a.label.localeCompare(b.label),
        );
    }, [crises, t, i18n.language]);

    const handleSelect = (crisisId: string | null) => {
        onSelect(crisisId);
        setOpen(false);
    };

    if (loading) {
        if (variant === "inline") {
            return (
                <div
                    role="status"
                    aria-label={t("reporter.wizard.fields.crisis_loading")}
                    className="flex h-8 items-center gap-1.5 rounded-md border border-input px-3 text-xs text-muted-foreground"
                >
                    <span
                        className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                        aria-hidden="true"
                    />
                    {t("reporter.wizard.fields.crisis_loading")}
                </div>
            );
        }
        return (
            <div
                role="status"
                aria-label={t("reporter.wizard.fields.crisis_loading")}
                className="flex h-9 items-center gap-2 border-b border-border bg-card px-3 text-xs text-muted-foreground"
            >
                <span
                    className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent"
                    aria-hidden="true"
                />
                {t("reporter.wizard.fields.crisis_loading")}
            </div>
        );
    }

    if (variant === "inline") {
        return (
            <Popover open={open} onOpenChange={setOpen}>
                {/* Wrapper gives the clear × button a positioned anchor without nesting buttons */}
                <div className="relative w-full">
                    <PopoverTrigger asChild>
                        <Button
                            id="crisis-selector"
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            aria-label={t("reporter.map.crisis_selector_label")}
                            className={cn(
                                "h-8 w-full justify-between border-input bg-card text-xs font-normal",
                                selectedCrisis && "pe-7", // leave room for the absolute clear button
                            )}
                        >
                            {/* Left: globe icon + crisis name (+ country if selected) */}
                            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                <Globe aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate text-foreground">
                                    {selectedCrisis
                                        ? selectedCrisis.name
                                        : t("reporter.map.crisis_selector_placeholder")}
                                </span>
                                {selectedCrisis && (
                                    <span className="shrink-0 text-muted-foreground">
                                        · {selectedCrisis.country}
                                    </span>
                                )}
                            </span>

                            {/* Chevron — only when nothing selected */}
                            {!selectedCrisis && (
                                <ChevronsUpDown
                                    aria-hidden="true"
                                    className="ms-1 size-3.5 shrink-0 text-muted-foreground"
                                />
                            )}
                        </Button>
                    </PopoverTrigger>

                    {/* Clear button — sibling to PopoverTrigger, absolutely placed so it
              appears inside the trigger visually but is NOT a nested <button> */}
                    {selectedCrisis && (
                        <button
                            type="button"
                            aria-label={t("reporter.map.crisis_selector_clear")}
                            onClick={() => handleSelect(null)}
                            className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X aria-hidden="true" className="size-3.5" />
                        </button>
                    )}
                </div>

                <PopoverContent className="p-0" align="start" sideOffset={4}>
                    <Command>
                        <CommandInput placeholder={t("reporter.map.crisis_search_placeholder")} />
                        <CommandList>
                            <CommandEmpty>{t("reporter.map.crisis_no_results")}</CommandEmpty>

                            {/* "All crises" reset item */}
                            <CommandItem value="__all__" onSelect={() => handleSelect(null)}>
                                <Globe aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                {t("reporter.map.crisis_selector_placeholder")}
                                <Check
                                    aria-hidden="true"
                                    className={cn("ms-auto size-3.5", selectedId === null ? "opacity-100" : "opacity-0")}
                                />
                            </CommandItem>

                            {grouped.length > 0 && <CommandSeparator />}

                            {/* Crisis items grouped by country, separated between groups */}
                            {grouped.map(([code, { label, crises: countryCrises }], index) => (
                                <Fragment key={code}>
                                    {index > 0 && <CommandSeparator />}
                                    <CommandGroup heading={label}>
                                        {countryCrises.map((crisis) => (
                                            <CommandItem
                                                key={crisis.id}
                                                value={[
                                                    crisis.name,
                                                    code,
                                                    label,
                                                    crisis.region ?? "",
                                                ].join(" ")}
                                                onSelect={() => handleSelect(crisis.id)}
                                            >
                                                {crisis.name}
                                                <Check
                                                    aria-hidden="true"
                                                    className={cn(
                                                        "ms-auto size-3.5",
                                                        selectedId === crisis.id ? "opacity-100" : "opacity-0",
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </Fragment>
                            ))}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        );
    }

    return (
        <div className="shrink-0 border-b border-border bg-card px-3 py-2">
            <Popover open={open} onOpenChange={setOpen}>
                {/* Wrapper gives the clear × button a positioned anchor without nesting buttons */}
                <div className="relative w-full">
                    <PopoverTrigger asChild>
                        <Button
                            id="crisis-selector"
                            variant="outline"
                            role="combobox"
                            aria-expanded={open}
                            aria-label={t("reporter.map.crisis_selector_label")}
                            className={cn(
                                "h-8 w-full justify-between border-input bg-card text-xs font-normal",
                                selectedCrisis && "pe-7",
                            )}
                        >
                            <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                                <Globe aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
                                <span className="truncate text-foreground">
                                    {selectedCrisis
                                        ? selectedCrisis.name
                                        : t("reporter.map.crisis_selector_placeholder")}
                                </span>
                                {selectedCrisis && (
                                    <span className="shrink-0 text-muted-foreground">
                                        · {selectedCrisis.country}
                                    </span>
                                )}
                            </span>
                            {!selectedCrisis && (
                                <ChevronsUpDown
                                    aria-hidden="true"
                                    className="ms-1 size-3.5 shrink-0 text-muted-foreground"
                                />
                            )}
                        </Button>
                    </PopoverTrigger>
                    {selectedCrisis && (
                        <button
                            type="button"
                            aria-label={t("reporter.map.crisis_selector_clear")}
                            onClick={() => handleSelect(null)}
                            className="absolute end-1.5 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <X aria-hidden="true" className="size-3.5" />
                        </button>
                    )}
                </div>
                <PopoverContent className="p-0" align="start" sideOffset={4}>
                    <Command>
                        <CommandInput placeholder={t("reporter.map.crisis_search_placeholder")} />
                        <CommandList>
                            <CommandEmpty>{t("reporter.map.crisis_no_results")}</CommandEmpty>
                            <CommandItem value="__all__" onSelect={() => handleSelect(null)}>
                                <Globe aria-hidden="true" className="size-3.5 text-muted-foreground" />
                                {t("reporter.map.crisis_selector_placeholder")}
                                <Check
                                    aria-hidden="true"
                                    className={cn("ms-auto size-3.5", selectedId === null ? "opacity-100" : "opacity-0")}
                                />
                            </CommandItem>
                            {grouped.length > 0 && <CommandSeparator />}
                            {grouped.map(([code, { label, crises: countryCrises }], index) => (
                                <Fragment key={code}>
                                    {index > 0 && <CommandSeparator />}
                                    <CommandGroup heading={label}>
                                        {countryCrises.map((crisis) => (
                                            <CommandItem
                                                key={crisis.id}
                                                value={[
                                                    crisis.name,
                                                    code,
                                                    label,
                                                    crisis.region ?? "",
                                                ].join(" ")}
                                                onSelect={() => handleSelect(crisis.id)}
                                            >
                                                {crisis.name}
                                                <Check
                                                    aria-hidden="true"
                                                    className={cn(
                                                        "ms-auto size-3.5",
                                                        selectedId === crisis.id ? "opacity-100" : "opacity-0",
                                                    )}
                                                />
                                            </CommandItem>
                                        ))}
                                    </CommandGroup>
                                </Fragment>
                            ))}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>
        </div>
    );
}
