"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import {
  Map,
  Camera,
  ClipboardList,
  BarChart3,
  Download,
  Flag,
  Users,
  Settings,
  SidebarIcon,
  LogIn,
  PanelRightOpen,
  PanelRightClose,
  Sun,
  Moon,
  Monitor,
  LayoutDashboard,
  ChevronsUpDown,
  Languages,
  Check,
  User,
  LogOut,
  Award,
  Radio,
  ShieldCheck,
  Tent,
  ArrowUpRight,
  Plus,
  HeartHandshake,
  FileClock,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  DensityProvider,
  type DensityMode,
} from "@/components/shared/density-provider";
import { LanguageSwitcher } from "@/components/shared/language-switcher";
import { ReporterSessionBootstrap } from "@/components/shared/reporter-session-bootstrap";
import { CrisisBrand } from "@/components/shared/crisis-brand";
import { i18nConfig } from "@/lib/i18n/config";
import { useI18nLanguage } from "@/lib/i18n/provider";
import { useReportPanel } from "@/lib/report-panel-context";
import { useTheme } from "@/components/shared/theme-provider";
import { useIsMobile } from "@/hooks/use-mobile";
import { type SupportedLanguage } from "@/lib/i18n/config";
import { ConnectivityControls } from "@/components/shared/connectivity-controls";
import { useConnectivity } from "@/lib/offline/connectivity";
import { DATA_CHANGE_EVENT } from "@/lib/offline/mode";
import { listAll } from "@/lib/offline/queue";
import { useConnectivityToast } from "@/lib/offline/use-connectivity-toast";
import { apiClient, ApiError } from "@/lib/api/client";
import { authClient, signOut } from "@/lib/auth-client";
import { getOrCreateReporterId } from "@/lib/wizard-draft";

// ─── types ────────────────────────────────────────────────────────────────────

export type AppRole = "REPORTER" | "VIEWER" | "ANALYST" | "ADMIN" | "VOLUNTEER";

export interface AppShellUser {
  name?: string | null;
  email: string;
  role?: string | null;
}

export interface AppShellProps {
  role: AppRole;
  user?: AppShellUser | null;
  children: React.ReactNode;
}

// ─── nav config ───────────────────────────────────────────────────────────────

interface NavItem {
  key: string;
  href: string;
  icon: LucideIcon;
  roles: AppRole[];
}

const NAV_ITEMS: NavItem[] = [
  { key: "overview", href: "/", icon: LayoutDashboard, roles: ["REPORTER"] },
  { key: "map", href: "/map", icon: Map, roles: ["REPORTER"] },
  { key: "dashboard", href: "/dashboard", icon: LayoutDashboard, roles: ["VIEWER", "ANALYST", "ADMIN"] },
  { key: "report_damage", href: "/report", icon: Camera, roles: ["REPORTER"] },
  { key: "my_reports", href: "/my-reports", icon: ClipboardList, roles: ["REPORTER"] },
  { key: "offline_workspace", href: "/offline", icon: Radio, roles: ["REPORTER", "VIEWER", "ANALYST", "ADMIN"] },
  { key: "resources", href: "/resources", icon: Tent, roles: ["REPORTER"] },
  { key: "preparedness", href: "/preparedness", icon: ShieldCheck, roles: ["REPORTER"] },
  { key: "volunteer_join", href: "/volunteer", icon: HeartHandshake, roles: ["REPORTER"] },
  { key: "volunteer_dashboard", href: "/volunteer", icon: HeartHandshake, roles: ["VOLUNTEER"] },
  { key: "volunteer_profile", href: "/volunteer/profile", icon: User, roles: ["VOLUNTEER"] },
  { key: "volunteer_tasks", href: "/volunteer?view=tasks", icon: ClipboardList, roles: ["VOLUNTEER"] },
  { key: "volunteer_shifts", href: "/volunteer?view=shifts", icon: CalendarDays, roles: ["VOLUNTEER"] },
  { key: "community_map", href: "/map", icon: Map, roles: ["VOLUNTEER"] },
  { key: "volunteer_management", href: "/dashboard/volunteers", icon: HeartHandshake, roles: ["ADMIN"] },
  { key: "ai_logs", href: "/ai-logs", icon: FileClock, roles: ["REPORTER", "VOLUNTEER", "VIEWER", "ANALYST", "ADMIN"] },
  { key: "all_reports", href: "/dashboard/reports", icon: ClipboardList, roles: ["VIEWER", "ANALYST", "ADMIN"] },
  { key: "analytics", href: "/dashboard/analytics", icon: BarChart3, roles: ["ANALYST", "ADMIN"] },
  { key: "export", href: "/dashboard/export", icon: Download, roles: ["ANALYST", "ADMIN"] },
  { key: "moderation", href: "/dashboard/moderation", icon: Flag, roles: ["ANALYST", "ADMIN"] },
  { key: "users", href: "/dashboard/users", icon: Users, roles: ["ADMIN"] },
  { key: "crises", href: "/dashboard/crises", icon: Settings, roles: ["ADMIN"] },
];

// ─── helpers ──────────────────────────────────────────────────────────────────

function WorkspaceNavLink({ href, active, children, ...props }: React.ComponentProps<typeof Link> & { active: boolean }) {
  const { setOpenMobile } = useSidebar();
  return <Link {...props} href={href} aria-current={active ? "page" : undefined} onClick={(event) => { props.onClick?.(event); setOpenMobile(false); }}>{children}</Link>;
}

function getInitials(user: AppShellUser): string {
  if (user.name) return user.name[0].toUpperCase();
  return user.email[0].toUpperCase();
}

type SidebarAccountMenuProps = {
  user: AppShellUser;
  t: (key: string) => string;
  onOpenProfileDialog: () => void;
  onSignOut: () => void;
  theme: "light" | "dark" | "system";
  isDark: boolean;
  currentLanguage: SupportedLanguage;
  onThemeChange: (theme: "light" | "dark" | "system") => void;
  onLanguageChange: (language: SupportedLanguage) => void;
};

function getThemeLabel(
  t: (key: string) => string,
  value: "light" | "dark" | "system",
): string {
  if (value === "system") {
    return t("settings.theme_system");
  }

  return t(`settings.theme_${value}_selected`);
}

/** Shared menu content — reused in both desktop dropdown and mobile inline */
function AccountMenuItems({
  user, t, onSignOut, onOpenProfileDialog, theme, isDark, currentLanguage, onThemeChange, onLanguageChange,
}: Omit<SidebarAccountMenuProps, "user"> & { user: AppShellUser }) {
  return (
    <>
      <DropdownMenuLabel className="flex flex-col gap-0.5">
        <span className="text-sm font-medium">{user.name ?? t("app_shell.user_anonymous")}</span>
        <span className="text-xs font-normal text-muted-foreground">{user.email}</span>
      </DropdownMenuLabel>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={onOpenProfileDialog}>
        <User aria-hidden="true" className="size-4" />
        <span>{t("app_shell.profile_settings")}</span>
        <DropdownMenuShortcut aria-hidden="true">
          {t("app_shell.shortcut_profile_settings")}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
      {/* Appearance submenu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          {isDark ? <Moon aria-hidden="true" className="size-4" /> : <Sun aria-hidden="true" className="size-4" />}
          <span className="flex flex-1 flex-col text-start leading-tight">
            <span>{t("app_shell.appearance")}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {theme === "system" ? t("settings.theme_system") : isDark ? t("settings.theme_dark_selected") : t("settings.theme_light_selected")}
            </span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-40">
          {(["light", "dark", "system"] as const).map((val) => (
            <DropdownMenuItem key={val} onSelect={() => onThemeChange(val)}>
              {val === "light" ? <Sun aria-hidden="true" className="size-4" />
                : val === "dark" ? <Moon aria-hidden="true" className="size-4" />
                  : <Monitor aria-hidden="true" className="size-4" />}
              <span>{getThemeLabel(t, val)}</span>
              {theme === val && <Check aria-hidden="true" className="ms-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {/* Language submenu */}
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>
          <Languages aria-hidden="true" className="size-4" />
          <span className="flex flex-1 flex-col text-start leading-tight">
            <span>{t("language_label")}</span>
            <span className="text-xs font-normal text-muted-foreground">
              {t(`language_native.${currentLanguage}`)}
            </span>
          </span>
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="w-48">
          {i18nConfig.supportedLanguages.map((language) => (
            <DropdownMenuItem key={language} onSelect={() => onLanguageChange(language)}>
              <span className="font-mono text-xs uppercase text-muted-foreground">{language}</span>
              <span>{t(`language_native.${language}`)}</span>
              {currentLanguage === language && <Check aria-hidden="true" className="ms-auto size-4" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onSignOut}>
        <LogOut aria-hidden="true" className="size-4" />
        <span>{t("app_shell.sign_out")}</span>
        <DropdownMenuShortcut aria-hidden="true">
          {t("app_shell.shortcut_sign_out")}
        </DropdownMenuShortcut>
      </DropdownMenuItem>
    </>
  );
}

function SidebarAccountMenu({
  user,
  t,
  onSignOut,
  onOpenProfileDialog,
  theme,
  isDark,
  currentLanguage,
  onThemeChange,
  onLanguageChange,
}: SidebarAccountMenuProps) {
  const { state, isMobile } = useSidebar();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [mobileAppearanceOpen, setMobileAppearanceOpen] = useState(false);
  const [mobileLanguageOpen, setMobileLanguageOpen] = useState(false);
  const menuSide = state === "collapsed" ? "right" : "top";
  const menuAlign = state === "collapsed" ? "end" : "start";

  const accountTriggerContent = (
    <>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-sidebar-primary text-sm font-semibold text-sidebar-primary-foreground">
        {getInitials(user)}
      </span>
      <span className="grid flex-1 text-start text-sm leading-tight">
        <span className="truncate font-medium">{user.name ?? t("app_shell.user_anonymous")}</span>
        <span className="truncate text-xs text-muted-foreground">{user.email}</span>
      </span>
      <ChevronsUpDown aria-hidden="true" className="ms-auto size-4 shrink-0 opacity-50" />
    </>
  );

  /* ── Mobile: inline expansion inside the Sheet (no portal) ── */
  if (isMobile) {
    return (
      <SidebarMenuItem>
        {mobileOpen && (
          <div className="mb-1 flex flex-col rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md">
            <div className="px-2 py-1.5">
              <div className="text-sm font-medium">{user.name ?? t("app_shell.user_anonymous")}</div>
              <div className="text-xs font-normal text-muted-foreground">{user.email}</div>
            </div>
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={onOpenProfileDialog}
            >
              <User aria-hidden="true" className="size-4" />
              <span>{t("app_shell.profile_settings")}</span>
              <span className="ms-auto text-xs tracking-widest text-muted-foreground" aria-hidden="true">
                {t("app_shell.shortcut_profile_settings")}
              </span>
            </button>
            <button
              type="button"
              className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => setMobileAppearanceOpen((open) => !open)}
            >
              {isDark ? <Moon aria-hidden="true" className="size-4" /> : <Sun aria-hidden="true" className="size-4" />}
              <span className="flex flex-1 flex-col text-start leading-tight">
                <span>{t("app_shell.appearance")}</span>
                <span className="text-xs font-normal text-muted-foreground">{getThemeLabel(t, theme)}</span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
            </button>
            {mobileAppearanceOpen ? (
              <div className="ms-6 flex flex-col gap-1 py-1">
                {(["light", "dark", "system"] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                    onClick={() => onThemeChange(value)}
                  >
                    {value === "light" ? <Sun aria-hidden="true" className="size-4" />
                      : value === "dark" ? <Moon aria-hidden="true" className="size-4" />
                        : <Monitor aria-hidden="true" className="size-4" />}
                    <span>{getThemeLabel(t, value)}</span>
                    {theme === value ? <Check aria-hidden="true" className="ms-auto size-4" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <button
              type="button"
              className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
              onClick={() => setMobileLanguageOpen((open) => !open)}
            >
              <Languages aria-hidden="true" className="size-4" />
              <span className="flex flex-1 flex-col text-start leading-tight">
                <span>{t("language_label")}</span>
                <span className="text-xs font-normal text-muted-foreground">{t(`language_native.${currentLanguage}`)}</span>
              </span>
              <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 opacity-50" />
            </button>
            {mobileLanguageOpen ? (
              <div className="ms-6 flex flex-col gap-1 py-1">
                {i18nConfig.supportedLanguages.map((language) => (
                  <button
                    key={language}
                    type="button"
                    className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden hover:bg-accent hover:text-accent-foreground focus-visible:bg-accent focus-visible:text-accent-foreground"
                    onClick={() => onLanguageChange(language)}
                  >
                    <span className="font-mono text-xs uppercase text-muted-foreground">{language}</span>
                    <span>{t(`language_native.${language}`)}</span>
                    {currentLanguage === language ? <Check aria-hidden="true" className="ms-auto size-4" /> : null}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="-mx-1 my-1 h-px bg-border" />
            <button
              type="button"
              className="relative flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-destructive outline-hidden hover:bg-destructive/10 focus-visible:bg-destructive/10"
              onClick={onSignOut}
            >
              <LogOut aria-hidden="true" className="size-4" />
              <span>{t("app_shell.sign_out")}</span>
              <span className="ms-auto text-xs tracking-widest text-muted-foreground" aria-hidden="true">
                {t("app_shell.shortcut_sign_out")}
              </span>
            </button>
          </div>
        )}
        <SidebarMenuButton
          size="lg"
          aria-label={user.name ?? user.email}
          aria-expanded={mobileOpen}
          className="border border-sidebar-border/70 bg-sidebar-accent/35 px-2.5 hover:bg-sidebar-accent"
          onClick={() => setMobileOpen((o) => !o)}
        >
          {accountTriggerContent}
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  }

  return (
    <SidebarMenuItem>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <SidebarMenuButton
            size="lg"
            tooltip={user.name ?? user.email}
            aria-label={user.name ?? user.email}
            className="border border-sidebar-border/70 bg-sidebar-accent/35 px-2.5 hover:bg-sidebar-accent"
          >
            {accountTriggerContent}
          </SidebarMenuButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align={menuAlign} side={menuSide} sideOffset={8}>
          <AccountMenuItems
            user={user} t={t} onSignOut={onSignOut} onOpenProfileDialog={onOpenProfileDialog}
            theme={theme} isDark={isDark} currentLanguage={currentLanguage}
            onThemeChange={onThemeChange} onLanguageChange={onLanguageChange}
          />
        </DropdownMenuContent>
      </DropdownMenu>
    </SidebarMenuItem>
  );
}

// ─── SiteHeader ────────────────────────────────────────────────────────────────
// position: fixed so it spans the full viewport width including the nav sidebar
// column. z-50 ensures it sits above sidebar (z-10) and report panel (z-20).

interface SiteHeaderProps {
  role: AppRole;
  user?: AppShellUser | null;
  language: SupportedLanguage;
  onLanguageChange: (lang: SupportedLanguage) => void;
  onOpenProfileDialog: () => void;
  reporterContribution?: {
    reportCount: number;
    badgeLevel: string | null;
  } | null;
}

/** Inner classes forwarded to controls so they match the dark primary header.
 *  Uses cn() (tailwind-merge) in each component to properly override defaults. */
const HDR_CTRL =
  "text-app-header-foreground/80 hover:bg-app-header-foreground/10 hover:text-app-header-foreground";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName;
  if (tagName === "INPUT" || tagName === "TEXTAREA" || tagName === "SELECT") {
    return true;
  }

  return target.isContentEditable;
}

const BADGE_LABEL_KEYS = {
  NEWCOMER: "reporter.badge.newcomer",
  CONTRIBUTOR: "reporter.badge.contributor",
  TRUSTED: "reporter.badge.trusted",
  EXPERT: "reporter.badge.expert",
} as const;

const BADGE_MILESTONES = [5, 20, 50] as const;

function getNextMilestone(reportCount: number): number | null {
  return BADGE_MILESTONES.find((threshold) => reportCount < threshold) ?? null;
}

function getBadgeLabel(t: (key: string) => string, badgeLevel: string | null): string {
  if (!badgeLevel) return t(BADGE_LABEL_KEYS.NEWCOMER);

  const normalized = badgeLevel.toUpperCase() as keyof typeof BADGE_LABEL_KEYS;
  const translationKey = BADGE_LABEL_KEYS[normalized];
  return translationKey ? t(translationKey) : badgeLevel;
}

function SiteHeader({ role, user, language, onLanguageChange, onOpenProfileDialog, reporterContribution }: SiteHeaderProps) {
  const { t } = useTranslation();
  const { toggleSidebar } = useSidebar();

  const handleSignOut = () => {
    void signOut().then(() => { window.location.href = "/login"; });
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || isEditableTarget(event.target)) {
        return;
      }

      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      if (!hasPrimaryModifier) {
        return;
      }

      if (!event.shiftKey && event.key === ",") {
        event.preventDefault();
        onOpenProfileDialog();
        return;
      }

      if (event.shiftKey && event.key.toLowerCase() === "q") {
        event.preventDefault();
        handleSignOut();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onOpenProfileDialog, user]);

  return (
    /*
     * position:fixed + inset-x-0: header spans the FULL viewport width, sitting
     * on top of both the nav sidebar (z-10) and the content area. z-50 keeps it
     * above everything including report panels (z-20).
     */
    <header className="response-header fixed inset-x-0 top-0 z-[1200] flex h-(--header-height) items-center gap-2 bg-app-header px-3 text-app-header-foreground">
      {/* Nav sidebar toggle */}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn("-ms-1 size-8 shrink-0", HDR_CTRL)}
            onClick={toggleSidebar}
            aria-label={t("app_shell.sidebar_expand")}
          >
            <SidebarIcon aria-hidden="true" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">{t("app_shell.sidebar_expand")}</TooltipContent>
      </Tooltip>

      {/* Vertical rule — plain div avoids Separator's bg-border class conflict */}
      <div aria-hidden="true" className="me-1 h-4 w-px shrink-0 bg-app-header-foreground/25" />

      {/* Brand — clicking the logo returns to the landing/map page */}
      <Link href="/" className="flex cursor-pointer items-center gap-2 text-app-header-foreground hover:opacity-90">
        <CrisisBrand />
      </Link>
      <span className="header-workspace-label">Community response workspace</span>

      {/* Right-side controls: utility cluster first, identity action last */}
      <div className="ms-auto flex items-center gap-1.5">
        {role === "REPORTER" && <Link href="/report" className="header-report-link"><Plus aria-hidden="true" />Report an incident<ArrowUpRight aria-hidden="true" /></Link>}
        {/*
          Utility chip pill — language + connectivity (+ optional contribution trigger).
          All interactive controls inside share the same h-7 height so they align.
          py-0.5 on the pill container adds 2px top/bottom to match the pill border.
        */}
        <div className="flex items-center gap-0.5 rounded-full border border-app-header-foreground/20 bg-app-header-foreground/5 px-1 py-0.5">
          {role === "REPORTER" && reporterContribution && reporterContribution.reportCount > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  data-testid="reporter-contribution-trigger"
                  aria-label={t("reporter.success.status_title")}
                  className={cn(
                    "inline-flex h-7 cursor-pointer items-center gap-1 rounded-full px-2 text-xs font-medium transition-colors",
                    HDR_CTRL,
                  )}
                >
                  <Award aria-hidden="true" className="size-3.5" />
                  <span>{reporterContribution.reportCount}</span>
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                side="bottom"
                sideOffset={14}
                showArrow
                arrowClassName="top-px fill-popover stroke-border"
                className="!z-[2147483647] w-72 space-y-2"
              >
                <h2 className="text-sm font-semibold text-foreground">
                  {t("reporter.success.status_title")}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary" className="capitalize">
                    {getBadgeLabel(t, reporterContribution.badgeLevel)}
                  </Badge>
                  <span className="text-xs text-foreground">
                    {t("reporter.success.impact_count", { count: reporterContribution.reportCount })}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  {getNextMilestone(reporterContribution.reportCount) !== null
                    ? t("reporter.success.next_milestone", { count: getNextMilestone(reporterContribution.reportCount) })
                    : t("reporter.success.top_tier")}
                </p>
                <Link
                  href="/my-reports"
                  className="inline-flex min-h-9 w-full items-center justify-center rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium text-foreground"
                >
                  {t("nav.my_reports")}
                </Link>
              </PopoverContent>
            </Popover>
          )}

          <LanguageSwitcher
            currentLanguage={language}
            onLanguageChange={onLanguageChange}
            triggerClassName={cn("h-7 rounded-full px-2", HDR_CTRL)}
          />

          <ConnectivityControls />

        </div>

      </div>
    </header>
  );
}

// ─── AppShell ─────────────────────────────────────────────────────────────────

export function AppShell({ role, user, children }: AppShellProps) {
  const { t, i18n } = useTranslation();
  const pathname = usePathname();
  const { isOnline } = useConnectivityToast();
  const { lastSync } = useConnectivity();
  const [localReportCount, setLocalReportCount] = useState(0);
  const [isProfileDialogOpen, setIsProfileDialogOpen] = useState(false);
  const [activeProfileTab, setActiveProfileTab] = useState<"account" | "password">("account");
  const { data: session } = authClient.useSession();
  const [optimisticUserName, setOptimisticUserName] = useState<string | null>(null);
  const [profileName, setProfileName] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [profilePending, setProfilePending] = useState(false);
  const [reporterContribution, setReporterContribution] = useState<{
    reportCount: number;
    badgeLevel: string | null;
  } | null>(null);
  const { language, setLanguage } = useI18nLanguage();

  const handleSignOut = () => {
    void signOut({
      fetchOptions: {
        onSuccess: () => {
          window.location.href = "/";
        },
      },
    });
  };

  const density: DensityMode = role === "REPORTER" || role === "VOLUNTEER" ? "field" : "operations";
  const sidebarSide = i18n.dir() === "rtl" ? "right" : "left";
  const reportPanel = useReportPanel();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  const isMobile = useIsMobile();
  const effectiveUser = user
    ? {
      ...user,
      name: optimisticUserName ?? user.name ?? session?.user?.name ?? null,
    }
    : null;

  const filteredItems = NAV_ITEMS.filter((item) =>
    item.roles.includes(role),
  );

  useEffect(() => {
    if (role !== "REPORTER") return;
    const refresh = () => { void listAll().then((items) => setLocalReportCount(items.length)).catch(() => {}); };
    refresh();
    const channel = typeof BroadcastChannel !== "undefined" ? new BroadcastChannel(DATA_CHANGE_EVENT) : undefined;
    channel?.addEventListener("message", refresh);
    window.addEventListener(DATA_CHANGE_EVENT, refresh);
    return () => { channel?.close(); window.removeEventListener(DATA_CHANGE_EVENT, refresh); };
  }, [role]);

  useEffect(() => {
    if (role !== "REPORTER") return;

    let active = true;

    async function loadReporterContribution() {
      if (!isOnline) return;
      try {
        const reporterId = getOrCreateReporterId();
        const profile = await apiClient.reporter.profile(reporterId);
        if (!active) return;
        setReporterContribution({
          reportCount: profile.data.reportCount,
          badgeLevel: profile.data.badgeLevel ?? null,
        });
      } catch {
        if (!active) return;
        setReporterContribution(null);
      }
    }

    loadReporterContribution();

    return () => {
      active = false;
    };
  }, [role, isOnline, lastSync]);

  const getPreferredProfileName = () =>
    optimisticUserName ?? user?.name ?? session?.user?.name ?? "";

  const handleOpenProfileDialog = () => {
    setProfileName(getPreferredProfileName());
    setIsProfileDialogOpen(true);
  };

  const handleProfileDialogOpenChange = (open: boolean) => {
    setIsProfileDialogOpen(open);
    if (open) {
      setProfileName(getPreferredProfileName());
    }
  };

  const handleUpdateName = async () => {

    const previousName = optimisticUserName ?? user?.name ?? session?.user?.name ?? null;
    const nextName = profileName.trim() || null;
    setOptimisticUserName(nextName);

    setProfilePending(true);
    const result = await authClient.updateUser({ name: profileName });

    if (result.error) {
      setOptimisticUserName(previousName);
      toast.error(result.error.message ?? t("profile.update_failed"));
      setProfilePending(false);
      return;
    }

    toast.success(t("profile.name_updated"));
    setProfilePending(false);
  };

  const handleChangePassword = async () => {

    if (newPassword !== confirmPassword) {
      toast.error(t("profile.password_mismatch"));
      return;
    }

    setProfilePending(true);
    try {
      await apiClient.account.changePassword(currentPassword, newPassword);
    } catch (error) {
      if (error instanceof ApiError) {
        toast.error(error.message);
      } else {
        toast.error(t("profile.update_failed"));
      }
      setProfilePending(false);
      return;
    }

    toast.success(t("profile.password_updated"));
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
    setProfilePending(false);
  };

  return (
    <>
      {role === "REPORTER" && <ReporterSessionBootstrap />}
      {/*
        Full-width layout: --header-height on SidebarProvider so map/fixed children can reference it.
        SiteHeader is position:fixed spanning the full viewport width.
        Sidebar starts below the header via pt-(--header-height) spacer.
      */}
      <SidebarProvider className="response-shell" style={{ "--header-height": "4.5rem", "--sidebar-width": "15rem" } as React.CSSProperties}>
        {/* SiteHeader: must remain inside SidebarProvider to access useSidebar() */}
        <SiteHeader
          role={role}
          user={effectiveUser}
          language={language as SupportedLanguage}
          onLanguageChange={setLanguage}
          onOpenProfileDialog={handleOpenProfileDialog}
          reporterContribution={reporterContribution}
        />

        {/* Primary nav sidebar — starts below the fixed header */}
        <Sidebar side={sidebarSide} collapsible="icon" variant="sidebar" className="border-sidebar-border" role="complementary" aria-label={t("app_shell.nav_label")}>
          {/*
           * Desktop: transparent spacer so nav starts below the fixed header.
           * Mobile (sheet overlay): show brand since the fixed header is hidden behind the overlay.
           */}
          <SidebarHeader className="shrink-0 border-none p-0">
            {/* Mobile-only brand row — hidden on md+ where the fixed header is visible */}
            <div className="flex h-14 items-center gap-2 border-b border-app-header-foreground/20 bg-app-header px-3 text-app-header-foreground md:hidden">
              <CrisisBrand />
            </div>
            {/* Desktop spacer — invisible, just reserves header height */}
            <div className="hidden h-(--header-height) md:block" aria-hidden="true" />
          </SidebarHeader>

          <SidebarContent className="px-2 pb-2">
            <p className="sidebar-section-label">{t("nav.workspace")}</p>
            {/* p-2 matches sidebar group padding */}
            <SidebarGroup className="px-0 py-2">
              <nav aria-label={t("app_shell.nav_label")}>
                <SidebarMenu className="gap-1.5">
                  {filteredItems.map((item) => {
                    const Icon = item.icon;
                    const isActive =
                      item.href === "/" || item.href === "/dashboard" || item.href === "/volunteer"
                        ? pathname === item.href
                        : pathname.startsWith(item.href);

                    return (
                      <SidebarMenuItem key={item.key}>
                        <SidebarMenuButton
                          asChild
                          isActive={isActive}
                          tooltip={t(`nav.${item.key}`)}
                          className="data-[active=true]:bg-sidebar-accent/80"
                        >
                          <WorkspaceNavLink href={item.href} active={isActive}>
                            <Icon aria-hidden="true" />
                            <span>{t(`nav.${item.key}`)}</span>
                          </WorkspaceNavLink>
                        </SidebarMenuButton>
                        {item.key === "my_reports" && localReportCount > 0 && (
                          <SidebarMenuBadge>{localReportCount > 99 ? "99+" : localReportCount}</SidebarMenuBadge>
                        )}
                        {item.key === "map" && isActive && reportPanel && !isMobile && (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <SidebarMenuAction
                                className="cursor-pointer"
                                onClick={(e) => { e.preventDefault(); reportPanel.toggle(); }}
                                aria-label={
                                  reportPanel.collapsed
                                    ? t("reporter.map.expand_sidebar")
                                    : t("reporter.map.collapse_sidebar")
                                }
                              >
                                {reportPanel.collapsed
                                  ? <PanelRightClose aria-hidden="true" />
                                  : <PanelRightOpen aria-hidden="true" />}
                              </SidebarMenuAction>
                            </TooltipTrigger>
                            <TooltipContent side="right">
                              {reportPanel.collapsed
                                ? t("reporter.map.expand_sidebar")
                                : t("reporter.map.collapse_sidebar")}
                            </TooltipContent>
                          </Tooltip>
                        )}
                      </SidebarMenuItem>
                    );
                  })}
                </SidebarMenu>
              </nav>
            </SidebarGroup>
          </SidebarContent>

          <SidebarFooter className="mt-auto border-t border-sidebar-border/80 p-2">
            {role === "REPORTER" && <Link href="/preparedness" className="sidebar-preparedness"><span className="feature-icon mint"><ShieldCheck aria-hidden="true" /></span><strong>A little preparation.<br />A little peace of mind.</strong><span>Build your safety plan <ArrowUpRight aria-hidden="true" /></span></Link>}
            <SidebarMenu>
              {user ? (
                <SidebarAccountMenu
                  user={effectiveUser ?? user}
                  t={t}
                  onSignOut={handleSignOut}
                  onOpenProfileDialog={handleOpenProfileDialog}
                  theme={theme}
                  isDark={isDark}
                  currentLanguage={language as SupportedLanguage}
                  onThemeChange={setTheme}
                  onLanguageChange={setLanguage}
                />
              ) : (
                <SidebarMenuItem>
                  <SidebarMenuButton asChild tooltip={t("nav.sign_in")}>
                    <Link href="/login">
                      <LogIn aria-hidden="true" />
                      <span>{t("nav.sign_in")}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}

              {(!user || role === "VOLUNTEER") && (
                <SidebarMenuItem>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <SidebarMenuButton
                        onClick={() => setTheme(isDark ? "light" : "dark")}
                        tooltip={isDark ? t("settings.theme_light") : t("settings.theme_dark")}
                        aria-pressed={isDark}
                      >
                        {isDark ? <Sun aria-hidden="true" /> : <Moon aria-hidden="true" />}
                        <span>{isDark ? t("settings.theme_light") : t("settings.theme_dark")}</span>
                      </SidebarMenuButton>
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      {isDark ? t("settings.theme_light") : t("settings.theme_dark")}
                    </TooltipContent>
                  </Tooltip>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarFooter>

          {/* Rail strip: hover/click to collapse or expand */}
          <SidebarRail className="hover:after:bg-sidebar-foreground/20 after:transition-colors" />
        </Sidebar>

        {/* Main content area */}
        <SidebarInset id="main-content" className="min-w-0">
          {/* Spacer matching the fixed header height so content doesn't hide under header */}
          <div className="h-(--header-height) shrink-0" aria-hidden="true" />

          <DensityProvider density={density}>
            {children}
          </DensityProvider>
        </SidebarInset>
        {role === "REPORTER" && isMobile && <nav className="mobile-response-nav" aria-label={t("nav.mobile_navigation")}>
          {NAV_ITEMS.filter((item) => ["overview", "map", "report_damage", "resources", "preparedness"].includes(item.key)).map((item) => <Link key={item.key} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={pathname === item.href ? "selected" : ""}><item.icon aria-hidden="true" /><span>{t(`nav.${item.key}`)}</span></Link>)}
        </nav>}
        {role === "VOLUNTEER" && isMobile && <nav className="mobile-response-nav volunteer-mobile-nav" aria-label="Volunteer navigation">
          {[{ href: "/volunteer", icon: HeartHandshake, label: "Dashboard" }, { href: "/volunteer/profile", icon: User, label: "My profile" }, { href: "/ai-logs", icon: FileClock, label: "AI logs" }].map((item) => <Link key={item.href} href={item.href} aria-current={pathname === item.href ? "page" : undefined} className={pathname === item.href ? "selected" : ""}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}
        </nav>}

        <Dialog open={isProfileDialogOpen} onOpenChange={handleProfileDialogOpenChange}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>{t("app_shell.profile_settings")}</DialogTitle>
              <DialogDescription>
                {session?.user?.email ?? effectiveUser?.email ?? t("app_shell.user_anonymous")}
              </DialogDescription>
            </DialogHeader>

            <Tabs
              value={activeProfileTab}
              onValueChange={(value) =>
                setActiveProfileTab(value === "password" ? "password" : "account")
              }
              className="grid gap-3"
            >
              <TabsList className="mb-1 w-fit justify-start">
                <TabsTrigger value="account">{t("profile.section_name")}</TabsTrigger>
                <TabsTrigger value="password">{t("profile.section_password")}</TabsTrigger>
              </TabsList>

              <TabsContent value="account" className="mt-0">
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="dialog-profile-name">{t("profile.name_label")}</Label>
                    <Input
                      id="dialog-profile-name"
                      value={profileName}
                      onChange={(event) => setProfileName(event.target.value)}
                      autoComplete="name"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dialog-profile-email">{t("profile.email_label")}</Label>
                    <Input
                      id="dialog-profile-email"
                      value={session?.user?.email ?? user?.email ?? ""}
                      disabled
                      autoComplete="email"
                    />
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="password" className="mt-0">
                <div className="grid gap-3">
                  <div className="grid gap-2">
                    <Label htmlFor="dialog-current-password">{t("profile.current_password")}</Label>
                    <PasswordInput
                      id="dialog-current-password"
                      value={currentPassword}
                      onChange={(event) => setCurrentPassword(event.target.value)}
                      autoComplete="current-password"
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dialog-new-password">{t("profile.new_password")}</Label>
                    <PasswordInput
                      id="dialog-new-password"
                      value={newPassword}
                      onChange={(event) => setNewPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="dialog-confirm-password">{t("profile.confirm_password")}</Label>
                    <PasswordInput
                      id="dialog-confirm-password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      autoComplete="new-password"
                      minLength={8}
                      required
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsProfileDialogOpen(false)}>
                {t("dashboard.reports.cancel_action")}
              </Button>
              {activeProfileTab === "account" && (
                <Button
                  type="button"
                  disabled={profilePending || !profileName}
                  onClick={() => {
                    void handleUpdateName();
                  }}
                >
                  {t("profile.save")}
                </Button>
              )}
              {activeProfileTab === "password" && (
                <Button
                  type="button"
                  disabled={profilePending || !currentPassword || !newPassword || !confirmPassword || newPassword !== confirmPassword}
                  onClick={() => {
                    void handleChangePassword();
                  }}
                >
                  {t("profile.change_password")}
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </SidebarProvider>
    </>
  );
}
