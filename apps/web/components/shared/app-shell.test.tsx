// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import React from "react";

const mockDir = vi.hoisted(() => ({ value: "ltr" as "ltr" | "rtl" }));
const pushMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn(() => new Promise<never>(() => { })));
const updateUserMock = vi.hoisted(() => vi.fn(async () => ({ data: null })));
const changePasswordMock = vi.hoisted(() => vi.fn(async () => ({ data: null })));
const reporterProfileMock = vi.hoisted(() => vi.fn());
const accountChangePasswordMock = vi.hoisted(() => vi.fn(async (_currentPassword?: string, _newPassword?: string) => ({ success: true })));

// ─── mocks ──────────────────────────────────────────────────────────────────

vi.mock("next/navigation", () => ({
    usePathname: () => "/",
    useRouter: () => ({ push: pushMock, replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
    useTranslation: () => ({ t: (k: string) => k, i18n: { dir: () => mockDir.value } }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/shared/undp-logo", () => ({
    UndpLogo: () => null,
}));
vi.mock("@/components/shared/theme-toggle", () => ({
    ThemeToggle: () => <button type="button" data-testid="theme-toggle" aria-label="theme-toggle" />,
}));
vi.mock("@/components/shared/language-switcher", () => ({
    LanguageSwitcher: () => (
        <button type="button" data-testid="language-switcher" aria-label="language_label" />
    ),
}));
vi.mock("@/lib/offline/use-connectivity-toast", () => ({
    useConnectivityToast: () => ({ isOnline: true, pendingCount: 0 }),
}));
vi.mock("@/components/shared/reporter-session-bootstrap", () => ({
    ReporterSessionBootstrap: () => null,
}));
vi.mock("@/components/shared/density-provider", () => ({
    DensityProvider: ({
        children,
    }: {
        children: React.ReactNode;
        density: string;
    }) => <>{children}</>,
}));
vi.mock("@/lib/i18n/provider", () => ({
    useI18nLanguage: () => ({ language: "en", setLanguage: () => { } }),
}));
vi.mock("@/lib/offline/register", () => ({ registerServiceWorker: () => { } }));
vi.mock("@/lib/offline/queue", () => ({ listPending: async () => [], listAll: async () => [] }));
vi.mock("@/lib/offline/sync", () => ({
    setupSyncTriggers: () => () => { },
}));
vi.mock("@/lib/api/client", () => ({
    apiClient: {
        reporter: {
            profile: (reporterId: string) => reporterProfileMock(reporterId),
        },
        account: {
            changePassword: (currentPassword: string, newPassword: string) => accountChangePasswordMock(currentPassword, newPassword),
        },
    },
}));
vi.mock("@/lib/wizard-draft", () => ({
    getOrCreateReporterId: () => "anon-1",
}));
vi.mock("@/lib/auth-client", () => ({
    signOut: signOutMock,
    authClient: {
        useSession: () => ({ data: { user: { name: "Reporter", email: "rep@test.com" } } }),
        updateUser: updateUserMock,
        changePassword: changePasswordMock,
    },
}));


import { AppShell } from "./app-shell";

// ─── helpers ─────────────────────────────────────────────────────────────────

const nav_keys = {
    map: "nav.map",
    dashboard: "nav.dashboard",
    report_damage: "nav.report_damage",
    my_reports: "nav.my_reports",
    all_reports: "nav.all_reports",
    analytics: "nav.analytics",
    export: "nav.export",
    moderation: "nav.moderation",
    users: "nav.users",
    crises: "nav.crises",
} as const;

function queryNavLink(key: string) {
    return screen.queryByRole("link", { name: new RegExp(key, "i") });
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("AppShell — role-based nav", () => {
    beforeEach(() => {
        pushMock.mockClear();
        signOutMock.mockClear();
        reporterProfileMock.mockClear();
        accountChangePasswordMock.mockClear();
    });

    it("opens profile dialog with Cmd/Ctrl+, when not typing", async () => {
        render(
            <AppShell
                role="REPORTER"
                user={{ name: "Reporter", email: "rep@test.com", role: "REPORTER" }}
            >
                <div />
            </AppShell>,
        );

        window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", metaKey: true }));

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(await screen.findByText("app_shell.profile_settings")).toBeInTheDocument();
    });

    it("runs sign out shortcut with Shift+Cmd/Ctrl+Q when not typing", () => {
        render(
            <AppShell
                role="REPORTER"
                user={{ name: "Reporter", email: "rep@test.com", role: "REPORTER" }}
            >
                <div />
            </AppShell>,
        );

        window.dispatchEvent(new KeyboardEvent("keydown", { key: "q", metaKey: true, shiftKey: true }));

        expect(signOutMock).toHaveBeenCalledTimes(1);
    });

    it("does not run shortcuts while typing in an input", async () => {
        const user = userEvent.setup();
        render(
            <AppShell
                role="REPORTER"
                user={{ name: "Reporter", email: "rep@test.com", role: "REPORTER" }}
            >
                <label htmlFor="note">Note</label>
                <input id="note" />
            </AppShell>,
        );

        const noteInput = screen.getByLabelText("Note");
        await user.click(noteInput);

        fireEvent.keyDown(noteInput, { key: ",", metaKey: true });
        fireEvent.keyDown(noteInput, { key: "q", metaKey: true, shiftKey: true });

        expect(pushMock).not.toHaveBeenCalled();
        expect(signOutMock).not.toHaveBeenCalled();
    });

    it("uses right-side sidebar in RTL", () => {
        mockDir.value = "rtl";
        const { container } = render(
            <AppShell role="VIEWER" user={{ email: "v@test.com", role: "VIEWER" }}>
                <div>child</div>
            </AppShell>,
        );

        const sidebar = container.querySelector('[data-slot="sidebar"][data-side="right"]');
        expect(sidebar).not.toBeNull();
        mockDir.value = "ltr";
    });

    it("keeps fixed header above map controls", () => {
        const { container } = render(
            <AppShell role="VIEWER" user={{ email: "v@test.com", role: "VIEWER" }}>
                <div>child</div>
            </AppShell>,
        );

        const header = container.querySelector("header");
        expect(header).not.toBeNull();
        expect(header?.className).toContain("z-[1200]");
    });

    it("REPORTER: shows map, report_damage, my_reports; hides analyst/admin items", () => {
        render(
            <AppShell role="REPORTER" user={null}>
                <div>child</div>
            </AppShell>,
        );

        expect(queryNavLink(nav_keys.map)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.report_damage)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.my_reports)).toBeInTheDocument();

        expect(queryNavLink(nav_keys.all_reports)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.analytics)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.export)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.moderation)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.users)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.crises)).not.toBeInTheDocument();
    });

    it("shows contribution popover trigger for reporter after first submission", async () => {
        reporterProfileMock.mockResolvedValue({
            success: true,
            data: { reporterId: "anon-1", reportCount: 2, badgeLevel: "CONTRIBUTOR", lastActiveAt: "" },
        });

        render(
            <AppShell role="REPORTER" user={null}>
                <div>child</div>
            </AppShell>,
        );

        expect(await screen.findByTestId("reporter-contribution-trigger")).toBeInTheDocument();
    });

    it("opens contribution popover below the header trigger with an arrow indicator", async () => {
        const user = userEvent.setup();
        reporterProfileMock.mockResolvedValue({
            success: true,
            data: { reporterId: "anon-1", reportCount: 2, badgeLevel: "CONTRIBUTOR", lastActiveAt: "" },
        });

        render(
            <AppShell role="REPORTER" user={null}>
                <div>child</div>
            </AppShell>,
        );

        await user.click(await screen.findByTestId("reporter-contribution-trigger"));

        expect(await screen.findByText("reporter.success.status_title")).toBeInTheDocument();
        const arrow = document.querySelector('[data-slot="popover-arrow"]');
        expect(arrow).not.toBeNull();
        expect(arrow).toHaveClass("top-px");
    });

    it("does not show contribution popover trigger when no report submitted yet", async () => {
        reporterProfileMock.mockResolvedValue({
            success: true,
            data: { reporterId: "anon-1", reportCount: 0, badgeLevel: "NEWCOMER", lastActiveAt: "" },
        });

        render(
            <AppShell role="REPORTER" user={null}>
                <div>child</div>
            </AppShell>,
        );

        await screen.findByRole("link", { name: /nav\.map/i });
        expect(screen.queryByTestId("reporter-contribution-trigger")).not.toBeInTheDocument();
    });

    it("VIEWER: shows dashboard, all_reports; hides reporter/analyst/admin items", () => {
        render(
            <AppShell role="VIEWER" user={{ email: "v@test.com", role: "VIEWER" }}>
                <div>child</div>
            </AppShell>,
        );

        expect(queryNavLink(nav_keys.dashboard)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.all_reports)).toBeInTheDocument();

        expect(queryNavLink(nav_keys.report_damage)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.my_reports)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.analytics)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.export)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.moderation)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.users)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.crises)).not.toBeInTheDocument();
    });

    it("ANALYST: shows map, all_reports, analytics, export, moderation; hides reporter/admin-only items", () => {
        render(
            <AppShell
                role="ANALYST"
                user={{ email: "a@test.com", role: "ANALYST" }}
            >
                <div>child</div>
            </AppShell>,
        );

        expect(queryNavLink(nav_keys.dashboard)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.all_reports)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.analytics)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.export)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.moderation)).toBeInTheDocument();

        expect(queryNavLink(nav_keys.map)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.report_damage)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.my_reports)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.users)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.crises)).not.toBeInTheDocument();
    });

    it("ADMIN: shows all admin nav items (dashboard, all_reports, analytics, export, moderation, users, crises)", () => {
        render(
            <AppShell
                role="ADMIN"
                user={{ name: "Admin", email: "admin@test.com", role: "ADMIN" }}
            >
                <div>child</div>
            </AppShell>,
        );

        // Items visible to ADMIN (by NAV_CONFIG roles)
        expect(queryNavLink(nav_keys.dashboard)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.all_reports)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.analytics)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.export)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.moderation)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.users)).toBeInTheDocument();
        expect(queryNavLink(nav_keys.crises)).toBeInTheDocument();

        // REPORTER-only items should NOT appear for ADMIN
        expect(queryNavLink(nav_keys.map)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.report_damage)).not.toBeInTheDocument();
        expect(queryNavLink(nav_keys.my_reports)).not.toBeInTheDocument();
    });

    it("REPORTER with user=null shows sign-in link; authenticated user shows avatar initials", () => {
        const { rerender } = render(
            <AppShell role="REPORTER" user={null}>
                <div />
            </AppShell>,
        );

        // sign-in link present when no user (may appear in topbar and/or sidebar footer)
        expect(
            screen.getAllByRole("link", { name: /nav\.sign_in|sign.?in/i }).length,
        ).toBeGreaterThan(0);

        rerender(
            <AppShell
                role="ADMIN"
                user={{ name: "Jane Doe", email: "jane@test.com" }}
            >
                <div />
            </AppShell>,
        );

        // Avatar with first-letter initial shown
        expect(screen.getByText("J")).toBeInTheDocument();
    });

    it("renders children inside the shell", () => {
        render(
            <AppShell role="REPORTER" user={null}>
                <p data-testid="child-content">hello world</p>
            </AppShell>,
        );
        expect(screen.getByTestId("child-content")).toBeInTheDocument();
    });

    it("REPORTER account menu opens profile/settings dialog", async () => {
        render(
            <AppShell
                role="REPORTER"
                user={{ name: "Reporter", email: "rep@test.com", role: "REPORTER" }}
            >
                <div />
            </AppShell>,
        );

        await userEvent.click(screen.getByRole("button", { name: "Reporter" }));

        expect(screen.getByRole("menuitem", { name: /app_shell\.appearance/i })).toBeInTheDocument();
        expect(screen.getByRole("menuitem", { name: /language_label/i })).toBeInTheDocument();
        const profileItem = screen.getByRole("menuitem", { name: /app_shell\.profile_settings/ });
        const signOutItem = screen.getByRole("menuitem", { name: /app_shell\.sign_out/ });

        expect(profileItem.querySelector("svg")).not.toBeNull();
        expect(signOutItem.querySelector("svg")).not.toBeNull();

        expect(screen.getByText("app_shell.shortcut_profile_settings")).toHaveAttribute(
            "data-slot",
            "dropdown-menu-shortcut",
        );
        expect(screen.getByText("app_shell.shortcut_sign_out")).toHaveAttribute(
            "data-slot",
            "dropdown-menu-shortcut",
        );
        expect(screen.getByText("app_shell.shortcut_profile_settings")).toHaveAttribute("aria-hidden", "true");
        expect(screen.getByText("app_shell.shortcut_sign_out")).toHaveAttribute("aria-hidden", "true");

        await userEvent.click(profileItem);

        expect(await screen.findByRole("dialog")).toBeInTheDocument();
        expect(await screen.findByText("app_shell.profile_settings")).toBeInTheDocument();
    });

    it("authenticated shell keeps header utility-only and places user menu in sidebar footer", () => {
        render(
            <AppShell
                role="ADMIN"
                user={{ name: "Jane Doe", email: "jane@test.com", role: "ADMIN" }}
            >
                <div />
            </AppShell>,
        );

        const language = screen.getByTestId("language-switcher");
        const status = screen.getByRole("switch", { name: "connectivity_mode.toggle" });
        const userMenu = screen.getByRole("button", { name: "Jane Doe" });
        const header = document.querySelector("header");

        expect(language.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
        expect(screen.queryByTestId("theme-toggle")).not.toBeInTheDocument();
        expect(header?.contains(userMenu)).toBe(false);
    });

    it("opens account menu above when expanded and to the right when collapsed", async () => {
        render(
            <AppShell
                role="ADMIN"
                user={{ name: "Jane Doe", email: "jane@test.com", role: "ADMIN" }}
            >
                <div />
            </AppShell>,
        );

        const accountTrigger = screen.getByRole("button", { name: "Jane Doe" });
        await userEvent.click(accountTrigger);

        expect(screen.getByRole("menu")).toHaveAttribute("data-side", "top");

        await userEvent.keyboard("{Escape}");
        fireEvent.keyDown(window, { key: "b", metaKey: true });

        await userEvent.click(accountTrigger);
        expect(screen.getByRole("menu")).toHaveAttribute("data-side", "right");
    });
});
