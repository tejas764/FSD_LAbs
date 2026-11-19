"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronsUpDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
    Command,
    CommandEmpty,
    CommandInput,
    CommandItem,
    CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { apiClient, type Crisis } from "@/lib/api/client";
import { getCountryName, mergeCrisesUnique } from "@/lib/api/crises-utils";
import { DRAFT_STORAGE_KEY } from "@/lib/wizard-draft";
import { isOfflineMode } from "@/lib/offline/mode";

// ─── helpers ──────────────────────────────────────────────────────────────────

/**
 * Read reporter coordinates from the wizard sessionStorage draft.
 * Falls back to null if no valid lat/lng is stored.
 */
function readCoordsFromDraft(): { lat: number; lng: number } | null {
    try {
        const raw = sessionStorage.getItem(DRAFT_STORAGE_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as Record<string, unknown>;
        const lat = parsed.latitude !== undefined ? Number(parsed.latitude) : NaN;
        const lng = parsed.longitude !== undefined ? Number(parsed.longitude) : NaN;
        if (isNaN(lat) || isNaN(lng) || lat === 0 && lng === 0) return null;
        return { lat, lng };
    } catch {
        return null;
    }
}

// ─── props ────────────────────────────────────────────────────────────────────

interface CrisisSearchProps {
    /** Currently selected crisis id (required field — string not null). */
    value: string;
    onChange: (crisisId: string) => void;
    onSelect?: (crisis: Crisis | null) => void;
    /** Reporter coordinates for location-aware results. */
    coords?: { lat: number; lng: number };
}

// ─── component ────────────────────────────────────────────────────────────────

export function CrisisSearch({ value, onChange, onSelect, coords }: CrisisSearchProps) {
    const { t, i18n } = useTranslation();
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState("");
    const [results, setResults] = useState<Crisis[]>([]);
    const [loading, setLoading] = useState(false);
    const [isLocationFiltered, setIsLocationFiltered] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const baseResultsRef = useRef<Crisis[]>([]);

    // Effective coords: prop takes precedence, then draft sessionStorage (page-refresh case)
    const effectiveCoords = coords ?? readCoordsFromDraft();

    // Look up selected crisis from base results so it survives client-side filtering.
    const selectedCrisis =
        baseResultsRef.current.find((c) => c.id === value) ??
        results.find((c) => c.id === value) ??
        null;

    // ── search ──────────────────────────────────────────────────────────────

    const search = useCallback(
        async (q: string, useCoords = false) => {
            useCoords = useCoords && !isOfflineMode();
            setLoading(true);
            try {
                const locale = i18n.language;
                const opts: { q: string; take: number; lat?: number; lng?: number } = { q, take: 50 };
                if (useCoords && coords) {
                    opts.lat = coords.lat;
                    opts.lng = coords.lng;
                }
                let data = await apiClient.crises.list(true, opts);

                // If location-filtered but produced no results, fall back to unfiltered
                if (useCoords && data.length === 0) {
                    data = await apiClient.crises.list(true, { q, take: 50 });
                    setIsLocationFiltered(false);
                } else {
                    setIsLocationFiltered(useCoords && !!coords && data.length > 0);
                }

                if (!q) {
                    baseResultsRef.current = data;
                    setResults(data);
                } else {
                    // Merge: client-filtered base (includes country name match) + API name results
                    const lower = q.toLowerCase();
                    const clientFiltered = baseResultsRef.current.filter((c) => {
                        const country = getCountryName(c.country, locale).toLowerCase();
                        return c.name.toLowerCase().includes(lower) || country.includes(lower);
                    });
                    setResults(mergeCrisesUnique(clientFiltered, data));
                }
            } catch {
                setResults([]);
                setIsLocationFiltered(false);
            } finally {
                setLoading(false);
            }
        },
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [coords],
    );

    // On mount, load initial list — use reporter coords for location-aware results.
    useEffect(() => {
        void search("", !!coords);
    }, [search, coords]);

    // ── handlers ────────────────────────────────────────────────────────────

    function handleQueryChange(q: string) {
        setQuery(q);
        // Immediate client-side filter (name + country code + country name + region) for instant feedback
        if (!q) {
            setResults(baseResultsRef.current);
        } else {
            const lower = q.toLowerCase();
            const locale = i18n.language;
            setResults(
                baseResultsRef.current.filter((c) => {
                    const country = getCountryName(c.country, locale).toLowerCase();
                    return (
                        c.name.toLowerCase().includes(lower) ||
                        c.country.toLowerCase().includes(lower) ||
                        country.includes(lower) ||
                        (c.region ?? "").toLowerCase().includes(lower)
                    );
                }),
            );
        }
        // Debounced API call supplements with server-side name/country/region matches
        clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => void search(q, false), 300);
    }

    function handleSelect(crisis: Crisis) {
        onChange(crisis.id);
        onSelect?.(crisis);
        setOpen(false);
        setQuery("");
    }

    function handleOpenChange(next: boolean) {
        setOpen(next);
        if (next && query === "") {
            void search("", !!effectiveCoords);
        }
        if (!next) {
            setQuery("");
        }
    }

    // ── render ───────────────────────────────────────────────────────────────

    return (
        <div className="w-full">
            <Popover open={open} onOpenChange={handleOpenChange}>
                <PopoverTrigger asChild>
                    <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={open}
                        aria-label={t("reporter.wizard.fields.crisis")}
                        className="h-9 w-full justify-between border-input bg-background text-sm font-normal"
                    >
                        <span className="flex min-w-0 items-center gap-1.5 overflow-hidden">
                            {selectedCrisis ? (
                                <>
                                    <span className="truncate text-foreground">
                                        {selectedCrisis.name}
                                    </span>
                                    <span className="shrink-0 text-muted-foreground">
                                        &middot; {getCountryName(selectedCrisis.country, i18n.language)}
                                    </span>
                                </>
                            ) : (
                                <span className="text-muted-foreground">
                                    {loading
                                        ? t("reporter.wizard.fields.crisis_loading")
                                        : t("reporter.wizard.fields.crisis_placeholder")}
                                </span>
                            )}
                        </span>
                        <ChevronsUpDown
                            aria-hidden="true"
                            className="ms-2 size-4 shrink-0 text-muted-foreground opacity-50"
                        />
                    </Button>
                </PopoverTrigger>

                <PopoverContent
                    className="w-[--radix-popover-trigger-width] p-0"
                    align="start"
                    sideOffset={4}
                >
                    {/* shouldFilter=false: we handle filtering ourselves (debounced + country) */}
                    <Command shouldFilter={false}>
                        <CommandInput
                            placeholder={t("reporter.wizard.fields.crisis_placeholder")}
                            value={query}
                            onValueChange={handleQueryChange}
                        />
                        <CommandList>
                            {!loading && results.length === 0 && (
                                <CommandEmpty>{t("reporter.map.crisis_no_results")}</CommandEmpty>
                            )}
                            {results.map((crisis) => (
                                <CommandItem
                                    key={crisis.id}
                                    value={crisis.id}
                                    onSelect={() => handleSelect(crisis)}
                                >
                                    <div className="flex min-w-0 flex-1 flex-col">
                                        <span className="block text-sm">{crisis.name}</span>
                                        <span className="block text-xs text-muted-foreground">
                                            {getCountryName(crisis.country, i18n.language)}
                                        </span>
                                    </div>
                                    <Check
                                        aria-hidden="true"
                                        className={cn(
                                            "ms-2 size-4 shrink-0",
                                            value === crisis.id ? "opacity-100" : "opacity-0",
                                        )}
                                    />
                                </CommandItem>
                            ))}
                        </CommandList>
                    </Command>
                </PopoverContent>
            </Popover>

            {/* Location hint — only visible when not open and location filter is active */}
            {isLocationFiltered && !open && (
                <p className="mt-1 text-xs text-muted-foreground" aria-live="polite">
                    {t("reporter.wizard.fields.crisis_near_location")}
                </p>
            )}
        </div>
    );
}
