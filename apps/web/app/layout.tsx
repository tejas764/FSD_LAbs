import type { Metadata } from "next";
import Script from "next/script";
import fs from "node:fs";
import path from "node:path";
import { IBM_Plex_Sans, IBM_Plex_Mono, Noto_Sans_Arabic } from "next/font/google";
import "./globals.css";
import { SkipLink } from "@/components/shared/skip-link";
import { Toaster } from "@/components/ui/sonner";
import { I18nProvider } from "@/lib/i18n/provider";
import { i18nConfig } from "@/lib/i18n/config";
import { ThemeProvider } from "@/components/shared/theme-provider";
import { ConnectivityProvider } from "@/lib/offline/connectivity";

const ibmPlexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

const notoSansArabic = Noto_Sans_Arabic({
  subsets: ["arabic"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-arabic",
  display: "swap",
});

interface LoadedResources {
  resources: Record<string, { common: Record<string, string> }>;
  skipToContent: string;
}

function loadResources(): LoadedResources {
  const localesDir = path.join(process.cwd(), "public", "locales");
  const resources: Record<string, { common: Record<string, string> }> = {};
  let skipToContent = "Skip to main content";

  for (const lang of i18nConfig.supportedLanguages) {
    const filePath = path.join(localesDir, lang, "common.json");
    const content = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(content) as Record<string, unknown>;
    resources[lang] = { common: parsed as Record<string, string> };
    if (lang === i18nConfig.defaultLanguage && typeof parsed.skip_to_content === "string") {
      skipToContent = parsed.skip_to_content;
    }
  }

  return { resources, skipToContent };
}

// Metadata values are static — no filesystem reads at module evaluation time
export const metadata: Metadata = {
  title: "CrisisMap",
  description: "Community disaster response, incident reporting, and personal preparedness. Together. Prepared.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icons/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "48x48" },
    ],
    apple: { url: "/icons/icon.svg", type: "image/svg+xml" },
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { resources, skipToContent } = loadResources();
  const initialLanguage = i18nConfig.defaultLanguage;

  return (
    <html
      lang={initialLanguage}
      suppressHydrationWarning
      className={`${ibmPlexSans.variable} ${ibmPlexMono.variable} ${notoSansArabic.variable}`}
    >
      <head>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          // biome-ignore lint: inline script needed for FOUC prevention before hydration
          dangerouslySetInnerHTML={{
            __html: `try{var t=localStorage.getItem("theme")||"system";var d=t==="dark"||(t==="system"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);document.documentElement.style.colorScheme=d?"dark":"light";}catch(e){}`,
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <SkipLink label={skipToContent} />
        <ThemeProvider>
          <I18nProvider resources={resources} initialLanguage={initialLanguage}>
            <ConnectivityProvider>{children}</ConnectivityProvider>
            <Toaster richColors closeButton />
          </I18nProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
