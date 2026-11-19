import { Suspense } from "react";

import { SuccessContent } from "./success-content";

export default function SuccessPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-xl space-y-6 px-4 py-8 sm:px-6">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 shrink-0 animate-pulse rounded-full bg-muted" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-5 w-40 animate-pulse rounded bg-muted" />
              <div className="h-4 w-28 animate-pulse rounded bg-muted" />
            </div>
          </div>
          <div className="space-y-3">
            <div className="h-8 animate-pulse rounded bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
            <div className="h-11 animate-pulse rounded-md bg-muted" />
          </div>
        </div>
      }
    >
      <SuccessContent />
    </Suspense>
  );
}

