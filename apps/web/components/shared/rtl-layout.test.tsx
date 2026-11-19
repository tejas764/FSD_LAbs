// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, it, expect, beforeEach } from "vitest";
import Link from "next/link";
import { I18nProvider } from "@/lib/i18n/provider";
import { i18nConfig, type SupportedLanguage } from "@/lib/i18n/config";

// Mock layout with key structural elements
function MockReporterLayout() {
  return (
    <div data-testid="reporter-layout">
      <header role="banner">Header</header>
      <nav role="navigation">
        <Link href="/">Home</Link>
        <Link href="/reports">Reports</Link>
      </nav>
      <main id="main-content">Main Content</main>
      <footer role="contentinfo">Footer</footer>
    </div>
  );
}

describe("RTL Layout Verification", () => {
  beforeEach(() => {
    // Reset document attributes before each test
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
  });

  const mockResources = i18nConfig.supportedLanguages.reduce(
    (acc, lang) => {
      acc[lang as SupportedLanguage] = {
        common: {
          "report.submit": "Submit Report",
          "report.success": "Report Submitted Successfully",
        },
      };
      return acc;
    },
    {} as Record<string, { common: Record<string, string> }>,
  );

  it("renders reporter layout correctly with dir='ltr' (English)", () => {
    render(
      <I18nProvider resources={mockResources} initialLanguage="en">
        <MockReporterLayout />
      </I18nProvider>,
    );

    const layout = screen.getByTestId("reporter-layout");
    expect(layout).toBeInTheDocument();

    // Verify document attributes after mount
    expect(document.documentElement.lang).toBe("en");
    expect(document.documentElement.dir).toBe("ltr");
  });

  it("renders reporter layout correctly with dir='rtl' (Arabic)", () => {
    render(
      <I18nProvider resources={mockResources} initialLanguage="ar">
        <MockReporterLayout />
      </I18nProvider>,
    );

    const layout = screen.getByTestId("reporter-layout");
    expect(layout).toBeInTheDocument();

    // Verify document attributes are set to RTL for Arabic
    expect(document.documentElement.lang).toBe("ar");
    expect(document.documentElement.dir).toBe("rtl");
  });

  it("maintains correct landmark structure in RTL", () => {
    render(
      <I18nProvider resources={mockResources} initialLanguage="ar">
        <MockReporterLayout />
      </I18nProvider>,
    );

    // Verify all landmarks are present regardless of text direction
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("navigation")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("contentinfo")).toBeInTheDocument();
  });

  it("has correct language in all supported locales", () => {
    const locales = i18nConfig.supportedLanguages;

    locales.forEach((locale) => {
      render(
        <I18nProvider resources={mockResources} initialLanguage={locale}>
          <MockReporterLayout />
        </I18nProvider>,
      );

      expect(document.documentElement.lang).toBe(locale);

      // Verify RTL languages have dir='rtl'
      if (i18nConfig.rtlLanguages.includes(locale as (typeof i18nConfig.rtlLanguages)[number])) {
        expect(document.documentElement.dir).toBe("rtl");
      } else {
        expect(document.documentElement.dir).toBe("ltr");
      }
    });
  });
});
