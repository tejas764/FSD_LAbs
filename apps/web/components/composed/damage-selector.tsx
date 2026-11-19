"use client";

import { AlertTriangle, HelpCircle, ShieldCheck, Triangle } from "lucide-react";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import type { DamageLevel } from "@/types/wizard";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface DamageSelectorProps {
  value: DamageLevel | null;
  onChange: (value: DamageLevel) => void;
  required?: boolean;
  className?: string;
  helpText?: string;
}

const OPTIONS: Array<{
  value: DamageLevel;
  labelKey: string;
  descriptionKey: string;
  Icon: typeof ShieldCheck;
  colorClass: string;
  ringClass: string;
}> = [
    {
      value: "MINIMAL",
      labelKey: "damage_minimal",
      descriptionKey: "damage_minimal_desc",
      Icon: ShieldCheck,
      colorClass: "bg-damage-none text-damage-none-foreground",
      ringClass: "ring-damage-none",
    },
    {
      value: "PARTIAL",
      labelKey: "damage_partial",
      descriptionKey: "damage_partial_desc",
      Icon: Triangle,
      colorClass: "bg-damage-partial text-damage-partial-foreground",
      ringClass: "ring-damage-partial",
    },
    {
      value: "COMPLETE",
      labelKey: "damage_complete",
      descriptionKey: "damage_complete_desc",
      Icon: AlertTriangle,
      colorClass: "bg-damage-complete text-damage-complete-foreground",
      ringClass: "ring-damage-complete",
    },
  ];

export function DamageSelector({
  value,
  onChange,
  required = false,
  className,
  helpText,
}: DamageSelectorProps) {
  const { t } = useTranslation();
  const groupId = useId();

  return (
    <fieldset className={className}>
      <legend className="mb-2 flex items-center gap-1 text-sm font-medium text-foreground">
        {t("step.damage.legend")}
        {helpText && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  aria-label={helpText}
                  className="ms-0.5 inline-flex size-3.5 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 hover:text-muted-foreground"
                >
                  <HelpCircle aria-hidden="true" className="size-3" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" className="w-52 text-xs leading-relaxed">{helpText}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </legend>
      <div className="grid gap-3">
        {OPTIONS.map((option) => {
          const inputId = `${groupId}-${option.value}`;
          const selected = value === option.value;
          return (
            <label
              key={option.value}
              htmlFor={inputId}
              className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border bg-card p-3 transition-colors ${selected
                  ? `ring-2 ${option.ringClass} border-transparent`
                  : "border-border hover:border-primary"
                }`}
            >
              <input
                id={inputId}
                type="radio"
                name={groupId}
                value={option.value}
                checked={selected}
                required={required}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              <span
                className={`inline-flex h-8 w-8 items-center justify-center rounded-md ${option.colorClass}`}
                aria-hidden="true"
              >
                <option.Icon className="h-4 w-4" />
              </span>
              <span className="flex flex-col text-start">
                <span className="text-sm font-semibold text-foreground">
                  {t(option.labelKey)}
                </span>
                <span className="text-xs text-muted-foreground">
                  {t(option.descriptionKey)}
                </span>
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
