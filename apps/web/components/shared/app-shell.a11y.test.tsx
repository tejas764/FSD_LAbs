import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import React from "react";
import { axe, toHaveNoViolations } from "jest-axe";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { dir: () => "ltr" } }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/components/shared/undp-logo", () => ({ UndpLogo: () => null }));
vi.mock("@/components/shared/theme-toggle", () => ({ ThemeToggle: () => null }));
vi.mock("@/components/shared/language-switcher", () => ({
  LanguageSwitcher: () => null,
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
      profile: () => new Promise(() => { }),
    },
    account: {
      changePassword: async () => ({ success: true }),
    },
  },
}));
vi.mock("@/lib/wizard-draft", () => ({
  getOrCreateReporterId: () => "anon-1",
}));

import { AppShell } from "./app-shell";

expect.extend(toHaveNoViolations);

describe("AppShell a11y", () => {
  it("has no axe violations for REPORTER role", async () => {
    const { container } = render(
      <AppShell role="REPORTER" user={null}>
        <div>
          <h1>Page title</h1>
        </div>
      </AppShell>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it("has no axe violations for ANALYST role", async () => {
    const { container } = render(
      <AppShell
        role="ANALYST"
        user={{ name: "Ana Lyst", email: "analyst@test.com", role: "ANALYST" }}
      >
        <div>
          <h1>Dashboard</h1>
        </div>
      </AppShell>,
    );
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
