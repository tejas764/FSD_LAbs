"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/components/shared/theme-provider";
import { useTranslation } from "react-i18next";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

interface ThemeToggleProps {
    className?: string;
}

export function ThemeToggle({ className }: ThemeToggleProps = {}) {
    const { resolvedTheme, setTheme } = useTheme();
    const { t } = useTranslation();
    const isDark = resolvedTheme === "dark";
    const label = isDark ? t("settings.theme_light") : t("settings.theme_dark");

    return (
        <Tooltip>
            <TooltipTrigger asChild>
                <Button
                    variant="ghost"
                    size="sm"
                    className={cn("h-8 min-h-0 w-8 px-0 text-muted-foreground hover:bg-accent hover:text-foreground", className)}
                    aria-label={label}
                    aria-pressed={isDark}
                    onClick={() => setTheme(isDark ? "light" : "dark")}
                >
                    {isDark ? (
                        <Sun aria-hidden="true" className="size-3.5" />
                    ) : (
                        <Moon aria-hidden="true" className="size-3.5" />
                    )}
                </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">{label}</TooltipContent>
        </Tooltip>
    );
}
