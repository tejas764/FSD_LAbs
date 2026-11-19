"use client";

import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

type SnapPoint = "closed" | "peek" | "half" | "full";

const SNAP_HEIGHTS: Record<Exclude<SnapPoint, "closed">, string> = {
    peek: "5.5rem",
    half: "50svh",
    full: "90svh",
};

interface BottomSheetProps {
    reportCount?: number;
    id?: string;
    controls?: React.ReactNode;
    children?: React.ReactNode;
}

export function BottomSheet({
    reportCount = 0,
    id = "report-list",
    controls,
    children,
}: BottomSheetProps) {
    const { t } = useTranslation();
    const [snap, setSnap] = useState<SnapPoint>("peek");
    const startY = useRef(0);
    const currentY = useRef(0);

    const isExpanded = snap === "half" || snap === "full";

    function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
        startY.current = e.clientY;
        currentY.current = e.clientY;
        (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    }

    function handlePointerMove(e: React.PointerEvent<HTMLDivElement>) {
        currentY.current = e.clientY;
    }

    function handlePointerUp(e: React.PointerEvent<HTMLDivElement>) {
        // Use tracked currentY so the delta is correct even if the browser
        // delivers pointerup at a stale clientY on real Android devices.
        const deltaY = currentY.current - startY.current;
        const THRESHOLD = 50;
        if (deltaY < -THRESHOLD) {
            if (snap === "peek") setSnap("half");
            else if (snap === "half") setSnap("full");
        } else if (deltaY > THRESHOLD) {
            if (snap === "full") setSnap("half");
            else if (snap === "half") setSnap("peek");
            else if (snap === "peek") setSnap("closed"); // swipe down from peek → close
        }
    }

    function handlePointerCancel() {
        // Reset tracking refs on cancelled gesture (e.g. multi-touch interruption).
        startY.current = 0;
        currentY.current = 0;
    }

    // Closed state: show a small pill button to reopen
    if (snap === "closed") {
        return (
            <button
                type="button"
                className="fixed bottom-4 inset-x-0 z-[90] mx-auto w-fit rounded-full border border-border bg-card px-5 py-2 text-sm font-medium text-foreground shadow-lg"
                onClick={() => setSnap("peek")}
                aria-label={t("reporter.map.report_count", { count: reportCount })}
            >
                {t("reporter.map.report_count", { count: reportCount })}
            </button>
        );
    }

    return (
        <div
            data-testid="bottom-sheet"
            id={id}
            role={isExpanded ? "dialog" : undefined}
            aria-label={isExpanded ? t("reporter.map.report_count", { count: reportCount }) : undefined}
            className={cn(
                "fixed inset-x-0 bottom-0 z-[90]",
                "overflow-hidden rounded-t-2xl border-t border-border bg-card shadow-lg",
                "transition-[height] duration-300 ease-out",
            )}
            style={{
                height: SNAP_HEIGHTS[snap as Exclude<SnapPoint, "closed">],
                paddingBottom: "env(safe-area-inset-bottom, 0px)",
            }}
        >
            {/* Drag handle — full-width tap zone, visual pill in center.
                touch-none prevents Android Chrome from intercepting the gesture
                for page scrolling, which would cancel the pointer capture. */}
            <div
                role="button"
                tabIndex={0}
                aria-label={t("reporter.map.drag_sheet")}
                className="flex h-10 w-full touch-none cursor-grab select-none items-center justify-center active:cursor-grabbing"
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerCancel={handlePointerCancel}
                onKeyDown={(e) => {
                    if (e.key === "ArrowUp") setSnap(snap === "peek" ? "half" : "full");
                    if (e.key === "ArrowDown") {
                        if (snap === "full") setSnap("half");
                        else if (snap === "half") setSnap("peek");
                        else setSnap("closed");
                    }
                    if (e.key === "Escape") setSnap("closed");
                }}
            >
                <div className="h-1.5 w-12 rounded-full bg-muted-foreground/40" aria-hidden="true" />
            </div>

            {/* Header: count label + close button — always in the same row */}
            <div className="flex items-center justify-between px-4 pb-2">
                <p className={cn(
                    "text-sm",
                    isExpanded ? "font-semibold text-card-foreground" : "text-muted-foreground",
                )}>
                    {t("reporter.map.report_count", { count: reportCount })}
                </p>
                {isExpanded && (
                    <button
                        type="button"
                        onClick={() => setSnap("peek")}
                        aria-label={t("reporter.map.close_sheet")}
                        className="flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                        <X aria-hidden="true" className="size-4" />
                    </button>
                )}
            </div>

            {/* Scrollable content — pb-24 clears the FAB (bottom-6 + size-14) */}
            {/* Controls (search + filter) pinned above scrollable list when expanded */}
            {isExpanded && controls && (
                <div className="shrink-0">{controls}</div>
            )}
            <div className="overflow-y-auto pb-24" style={{ maxHeight: "calc(100% - 4.5rem)" }}>
                {children}
            </div>
        </div>
    );
}
