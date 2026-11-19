"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DensityMode = "field" | "standard" | "operations";

interface DensityContextValue {
  density: DensityMode;
  setDensity: (density: DensityMode) => void;
}

const DensityContext = createContext<DensityContextValue | null>(null);

interface DensityProviderProps {
  density: DensityMode;
  children: ReactNode;
}

export function DensityProvider({ density, children }: DensityProviderProps) {
  const [mode, setMode] = useState<DensityMode>(density);
  const value = useMemo(
    () => ({ density: mode, setDensity: setMode }),
    [mode],
  );

  return (
    <DensityContext.Provider value={value}>
      {/* display:contents makes this div transparent to flex/grid layout
          while still allowing [data-density] CSS attribute selectors to work */}
      <div data-density={mode} style={{ display: "contents" }}>
        {children}
      </div>
    </DensityContext.Provider>
  );
}

export function useDensity() {
  const context = useContext(DensityContext);
  if (!context) {
    throw new Error("useDensity must be used inside DensityProvider");
  }

  return context;
}
