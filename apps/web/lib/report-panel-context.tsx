"use client";

import {
  createContext,
  useCallback,
  useContext,
  useState,
  type ReactNode,
} from "react";

interface ReportPanelContextValue {
  collapsed: boolean;
  toggle: () => void;
  setCollapsed: (v: boolean) => void;
}

const ReportPanelContext = createContext<ReportPanelContextValue | null>(null);

export function ReportPanelProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const toggle = useCallback(() => setCollapsed((v) => !v), []);

  return (
    <ReportPanelContext value={{ collapsed, toggle, setCollapsed }}>
      {children}
    </ReportPanelContext>
  );
}

/**
 * Returns the report panel context, or null when used outside a
 * ReportPanelProvider (e.g. inside the dashboard layout).
 */
export function useReportPanel() {
  return useContext(ReportPanelContext);
}
