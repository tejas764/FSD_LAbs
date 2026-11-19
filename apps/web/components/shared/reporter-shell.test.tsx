// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import React from "react";

let mockedPathname = "/report";

vi.mock("react-i18next", () => ({
    useTranslation: () => ({
        t: (key: string) => key,
    }),
}));

vi.mock("@/lib/i18n/provider", () => ({
    useI18nLanguage: () => ({
        language: "en",
        setLanguage: vi.fn(),
    }),
}));

vi.mock("@/components/shared/language-switcher", () => ({
    LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));
vi.mock("@/lib/offline/use-connectivity-toast", () => ({
    useConnectivityToast: () => ({ isOnline: true, pendingCount: 0 }),
}));
vi.mock("@/components/ui/tooltip", () => ({
    TooltipProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    TooltipTrigger: ({ children }: { children: React.ReactNode; asChild?: boolean }) => <>{children}</>,
    TooltipContent: () => null,
}));
vi.mock("@/components/shared/reporter-session-bootstrap", () => ({
    ReporterSessionBootstrap: () => null,
}));

vi.mock("@/lib/offline/register", () => ({
    registerServiceWorker: vi.fn(),
}));

vi.mock("@/lib/offline/queue", () => ({
    listPending: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/lib/offline/sync", () => ({
    setupSyncTriggers: vi.fn(() => vi.fn()),
}));

vi.mock("next/navigation", () => ({
    usePathname: () => mockedPathname,
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));

import { ReporterShell } from "./reporter-shell";

describe("ReporterShell", () => {
    beforeEach(() => {
        mockedPathname = "/report";
    });

    it("renders bottom navigation with centered inner container", async () => {
        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        expect(screen.getByRole("navigation")).toBeInTheDocument();
        const navInner = screen.getByTestId("reporter-bottom-nav-inner");
        expect(navInner).toBeInTheDocument();
        expect(navInner.className).toContain("justify-center");

        const navList = screen.getByTestId("reporter-bottom-nav-list");
        expect(navList.className).toContain("max-w-3xl");
    });

    it("highlights report tab for nested report routes with text-primary", () => {
        mockedPathname = "/report/success";

        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const reportLink = screen.getByRole("link", { name: "reporter.nav.report" });
        expect(reportLink.className).toContain("text-primary");
    });

    it("renders lucide icon inside each nav link", () => {
        mockedPathname = "/";

        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const mapLink = screen.getByRole("link", { name: "reporter.nav.map" });
        const reportLink = screen.getByRole("link", { name: "reporter.nav.report" });
        const myReportsLink = screen.getByRole("link", { name: "reporter.nav.my_reports" });

        expect(mapLink.querySelector("svg")).not.toBeNull();
        expect(reportLink.querySelector("svg")).not.toBeNull();
        expect(myReportsLink.querySelector("svg")).not.toBeNull();
    });

    it("icons inside nav links have aria-hidden=true", () => {
        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const navLinks = screen.getAllByRole("link").filter(
            (l) => l.querySelector("svg") !== null,
        );
        navLinks.forEach((link) => {
            const svg = link.querySelector("svg");
            expect(svg?.getAttribute("aria-hidden")).toBe("true");
        });
    });

    it("active nav link has text-primary, inactive has text-muted-foreground", () => {
        mockedPathname = "/";

        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const mapLink = screen.getByRole("link", { name: "reporter.nav.map" });
        const reportLink = screen.getByRole("link", { name: "reporter.nav.report" });

        expect(mapLink.className).toContain("text-primary");
        expect(reportLink.className).toContain("text-muted-foreground");
    });

    it("does not render settings tab in simplified crisis mode", () => {
        mockedPathname = "/settings";

        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        expect(
            screen.queryByRole("link", { name: "reporter.nav.settings" }),
        ).not.toBeInTheDocument();
    });

    it("highlights my-reports tab when on /my-reports route", () => {
        mockedPathname = "/my-reports";

        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const myReportsLink = screen.getByRole("link", { name: "reporter.nav.my_reports" });
        expect(myReportsLink.className).toContain("text-primary");
    });

    it("renders 3-column bottom nav including my-reports link", () => {
        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const navList = screen.getByTestId("reporter-bottom-nav-list");
        expect(navList.className).toContain("grid-cols-3");
        expect(screen.getByRole("link", { name: "reporter.nav.my_reports" })).toBeInTheDocument();
    });

    it("applies transparent classes to header when page is scrolled", async () => {
        Object.defineProperty(window, "scrollY", { value: 0, writable: true, configurable: true });

        render(
            <ReporterShell>
                <div>content</div>
            </ReporterShell>,
        );

        const header = screen.getByRole("banner");
        // Initially opaque
        expect(header.className).toContain("border-border");

        // Simulate scroll
        Object.defineProperty(window, "scrollY", { value: 20, configurable: true });
        fireEvent.scroll(window);

        await waitFor(() => {
            expect(screen.getByRole("banner").className).toContain("border-transparent");
        });
    });
});
