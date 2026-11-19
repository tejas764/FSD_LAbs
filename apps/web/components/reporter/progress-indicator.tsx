"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ProgressIndicatorProps {
  steps: string[];
  currentStep: number;
  onStepClick?: (step: number) => void;
}

export function ProgressIndicator({
  steps,
  currentStep,
  onStepClick,
}: ProgressIndicatorProps) {
  const { t } = useTranslation();

  return (
    <nav aria-label={t("progress.aria_label")} className="px-6 pt-3 pb-2">
      <ol className="flex gap-1">
        {steps.map((step, index) => {
          const isDone = index < currentStep;
          const isCurrent = index === currentStep;
          const isClickable = isDone && onStepClick != null;
          return (
            <li key={step} className="flex flex-1 flex-col items-center gap-1">
              <button
                type="button"
                disabled={!isClickable}
                onClick={isClickable ? () => onStepClick(index) : undefined}
                aria-current={isCurrent ? "step" : undefined}
                className={cn(
                  "w-full text-center text-xs font-medium transition-colors",
                  isCurrent ? "text-primary" : "text-muted-foreground",
                  isClickable && "cursor-pointer hover:text-primary",
                  !isClickable && "cursor-default",
                )}
              >
                {step}
              </button>
              <div
                className={cn(
                  "h-1 w-full rounded-full transition-colors",
                  isDone || isCurrent ? "bg-primary" : "bg-muted",
                )}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
