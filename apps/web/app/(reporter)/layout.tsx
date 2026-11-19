import { AppShell } from "@/components/shared/app-shell";
import { ReportPanelProvider } from "@/lib/report-panel-context";

export default function ReporterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ReportPanelProvider>
      <AppShell role="REPORTER" user={null}>{children}</AppShell>
    </ReportPanelProvider>
  );
}
