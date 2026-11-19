"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { Map, Camera, ClipboardList, LogIn } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DensityProvider,
  type DensityMode,
} from "@/components/shared/density-provider";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ReporterSessionBootstrap } from "@/components/shared/reporter-session-bootstrap";
import { ThemeToggle } from "@/components/shared/theme-toggle";
import { UndpLogo } from "@/components/shared/undp-logo";
import { TooltipProvider } from "@/components/ui/tooltip";
import { i18nConfig, type SupportedLanguage } from "@/lib/i18n/config";
import { useI18nLanguage } from "@/lib/i18n/provider";
import { ConnectivityControls } from "@/components/shared/connectivity-controls";
import { useConnectivityToast } from "@/lib/offline/use-connectivity-toast";

interface ReporterShellProps {
  children: React.ReactNode;
  density?: DensityMode;
}

export function ReporterShell({ children, density = "field" }: ReporterShellProps) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { language, setLanguage } = useI18nLanguage();
  useConnectivityToast();
  const [isScrolled, setIsScrolled] = useState(false);

  const dir = useMemo(
    () => (i18nConfig.rtlLanguages.includes(language as "ar") ? "rtl" : "ltr"),
    [language],
  );

  // Clear any scroll lock that Radix Select may have left on the body.
  // This can happen after: HMR hot-reload, React StrictMode double-invoke,
  // or navigating away while a dropdown was open.
  useEffect(() => {
    function clearScrollLock() {
      document.body.removeAttribute("data-scroll-locked");
      document.body.style.pointerEvents = "";
      // react-remove-scroll injects a block-interactivity-N class on body;
      // remove any such classes left behind by a stranded select.
      document.body.className = document.body.className
        .split(" ")
        .filter((c) => !c.startsWith("block-interactivity-"))
        .join(" ");
    }

    clearScrollLock();

    // Also clear when the user returns to the tab (visibility change can
    // surface a frozen page after backgrounding while a select was open).
    document.addEventListener("visibilitychange", clearScrollLock);
    return () => document.removeEventListener("visibilitychange", clearScrollLock);
  }, []);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 8);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const isMapRoute = pathname === "/";
  const isReportRoute = pathname.startsWith("/report");
  const isMyReportsRoute = pathname.startsWith("/my-reports");

  return (
    <DensityProvider density={density}>
      <TooltipProvider>
        <ReporterSessionBootstrap />
        <div className="min-h-screen bg-background text-foreground" dir={dir} lang={language}>
        <header
          suppressHydrationWarning
          className={`sticky top-0 z-[110] transition-[background-color,border-color,backdrop-filter] duration-200 ${isScrolled
            ? "border-b border-transparent bg-background/70 backdrop-blur-md shadow-sm"
            : "border-b border-border bg-card/90 backdrop-blur-sm"
            }`}
        >
          <div className="mx-auto flex w-full items-center justify-between gap-3 px-4 py-2 sm:px-6">
            <div className="flex items-center gap-3">
              <div className="rounded-lg bg-primary p-2.5">
                <UndpLogo
                  className="h-14 w-auto"
                />
              </div>
              <div className="border-s border-border ps-3">
                <h1 className="text-sm font-semibold leading-tight text-card-foreground">{t("reporter.title")}</h1>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              <ConnectivityControls />
              <Button asChild variant="ghost" size="sm" className="gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground">
                <Link href="/login">
                  <LogIn aria-hidden="true" className="size-3.5 shrink-0" />
                  <span>{t("reporter.nav.sign_in")}</span>
                </Link>
              </Button>
              <Separator orientation="vertical" className="h-4" />
              <LanguageSwitcher
                currentLanguage={language as SupportedLanguage}
                onLanguageChange={setLanguage}
              />
              <Separator orientation="vertical" className="h-4" />
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="px-4 pb-36 pt-4 sm:px-6 sm:pb-32" id="main-content">
          {children}
        </main>
        <nav
          aria-label={t("reporter.nav.aria_label")}
          className="fixed inset-x-0 bottom-0 z-(--z-sticky) border-t border-border bg-card/95 px-3 py-2 backdrop-blur-xs"
        >
          <div className="mx-auto flex w-full justify-center" data-testid="reporter-bottom-nav-inner">
            <ul className="grid w-full max-w-3xl grid-cols-3 gap-2 rounded-xl border border-border bg-background p-2 shadow-sm" data-testid="reporter-bottom-nav-list">
              <li>
                <Link
                  className={`flex min-h-(--target-size-min) flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${isMapRoute
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                  href="/"
                >
                  <Map aria-hidden="true" className="size-5" />
                  {t("reporter.nav.map")}
                </Link>
              </li>
              <li>
                <Link
                  className={`flex min-h-(--target-size-min) flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${isReportRoute
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                  href="/report"
                >
                  <Camera aria-hidden="true" className="size-5" />
                  {t("reporter.nav.report")}
                </Link>
              </li>
              <li>
                <Link
                  className={`flex min-h-(--target-size-min) flex-col items-center justify-center gap-0.5 rounded-md px-2 py-1.5 text-xs font-medium transition-colors ${isMyReportsRoute
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                    }`}
                  href="/my-reports"
                >
                  <ClipboardList aria-hidden="true" className="size-5" />
                  {t("reporter.nav.my_reports")}
                </Link>
              </li>
            </ul>
          </div>
        </nav>
        </div>
      </TooltipProvider>
    </DensityProvider>
  );
}
