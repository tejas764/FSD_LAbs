"use client";

import { Languages } from "lucide-react";
import { useTranslation } from "react-i18next";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { i18nConfig, type SupportedLanguage } from "@/lib/i18n/config";
import { cn } from "@/lib/utils";

interface LanguageSwitcherProps {
  currentLanguage: SupportedLanguage;
  onLanguageChange: (language: SupportedLanguage) => void;
  /** Extra classes forwarded to SelectTrigger — use to override colors on dark backgrounds */
  triggerClassName?: string;
}

export function LanguageSwitcher({
  currentLanguage,
  onLanguageChange,
  triggerClassName,
}: LanguageSwitcherProps) {
  const { t } = useTranslation();

  return (
    <Select
      value={currentLanguage}
      onValueChange={(value) => onLanguageChange(value as SupportedLanguage)}
    >
      <SelectTrigger
        suppressHydrationWarning
        aria-label={t("language_label")}
        className={cn(
          "h-7 min-h-0 w-auto cursor-pointer gap-1.5 border-0 bg-transparent px-3 py-1 text-xs shadow-none [&>svg:last-child]:size-3",
          "text-muted-foreground hover:bg-accent hover:text-foreground",
          triggerClassName,
        )}
      >
        <Languages aria-hidden="true" className="size-3.5 shrink-0" />
        <span className="font-medium">{currentLanguage.toUpperCase()}</span>
      </SelectTrigger>
      <SelectContent
        align="end"
        sideOffset={10}
        showArrow
        arrowClassName="top-px fill-popover stroke-border"
        className="!z-[2147483647]"
      >
        {i18nConfig.supportedLanguages.map((lang) => (
          <SelectItem key={lang} value={lang}>
            {lang.toUpperCase()} - {t(`language_native.${lang}`)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
