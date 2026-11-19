"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

interface TablePaginationControlsProps {
    page: number;
    total: number | string;
    canGoPrev: boolean;
    canGoNext: boolean;
    onPrev: () => void;
    onNext: () => void;
    pageSize: number;
    onPageSizeChange: (nextPageSize: number) => void;
    pageSizeOptions?: number[];
    className?: string;
}

export function TablePaginationControls({
    page,
    total,
    canGoPrev,
    canGoNext,
    onPrev,
    onNext,
    pageSize,
    onPageSizeChange,
    pageSizeOptions = [10, 20, 50, 100],
    className,
}: TablePaginationControlsProps) {
    const { t, i18n } = useTranslation();
    const formatter = new Intl.NumberFormat(i18n?.language);

    const formatPaginationValue = (value: number | string): string => {
        if (typeof value === "number") {
            return formatter.format(value);
        }

        if (/^\d+$/.test(value)) {
            return formatter.format(Number.parseInt(value, 10));
        }

        return value;
    };

    return (
        <div
            className={cn(
                "flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-xs text-muted-foreground",
                className,
            )}
        >
            <span>
                {t("dashboard.overview.table_page_of", {
                    page: formatPaginationValue(page),
                    total: formatPaginationValue(total),
                })}
            </span>

            <div className="flex items-center gap-2">
                <div className="flex items-center gap-1">
                    <span className="text-xs text-muted-foreground">
                        {t("dashboard.overview.table_rows_per_page")}
                    </span>
                    <Select
                        value={String(pageSize)}
                        onValueChange={(value) => {
                            const parsed = Number.parseInt(value, 10);
                            if (!Number.isNaN(parsed)) {
                                onPageSizeChange(parsed);
                            }
                        }}
                    >
                        <SelectTrigger
                            aria-label={t("dashboard.overview.table_rows_per_page")}
                            className="h-7 w-[84px] text-xs"
                        >
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            {pageSizeOptions.map((option) => (
                                <SelectItem key={option} value={String(option)}>
                                    {String(option)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>

                <div className="flex gap-1">
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={onPrev}
                        disabled={!canGoPrev}
                        aria-label={t("dashboard.overview.table_prev")}
                    >
                        <ChevronLeft className="size-3.5" aria-hidden="true" />
                        {t("dashboard.overview.table_prev")}
                    </Button>
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={onNext}
                        disabled={!canGoNext}
                        aria-label={t("dashboard.overview.table_next")}
                    >
                        {t("dashboard.overview.table_next")}
                        <ChevronRight className="size-3.5" aria-hidden="true" />
                    </Button>
                </div>
            </div>
        </div>
    );
}
