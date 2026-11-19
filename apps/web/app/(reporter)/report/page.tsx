
import { Suspense } from "react";

import { ReporterWizard } from "@/components/reporter/reporter-wizard";

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col gap-4 px-4 pt-4 pb-24 sm:px-6">
          <div className="h-2 w-full animate-pulse rounded-full bg-muted" />
          <div className="h-6 w-40 animate-pulse rounded bg-muted" />
          <div className="h-40 animate-pulse rounded-lg bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
      }
    >
      <ReporterWizard />
    </Suspense>
  );
}

