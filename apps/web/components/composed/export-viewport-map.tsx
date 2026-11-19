"use client";

import dynamic from "next/dynamic";

import { Skeleton } from "@/components/ui/skeleton";

const LeafletReportMap = dynamic(
    () =>
        import("@/components/composed/leaflet-report-map").then((m) => ({
            default: m.LeafletReportMap,
        })),
    {
        ssr: false,
        loading: () => <Skeleton className="h-44 w-full rounded-md" />,
    },
);

interface ExportViewportMapProps {
    onBoundsChange: (bounds: string) => void;
    fitBounds?: [number, number, number, number] | null;
}

export function ExportViewportMap({ onBoundsChange, fitBounds }: ExportViewportMapProps) {
    return (
        <div className="h-44 w-full overflow-hidden rounded-md border border-border">
            <LeafletReportMap
                features={[]}
                onBoundsChange={onBoundsChange}
                fitBounds={fitBounds}
            />
        </div>
    );
}
