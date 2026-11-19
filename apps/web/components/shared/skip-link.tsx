"use client";

import { useState } from "react";

interface SkipLinkProps {
  label: string;
}

export function SkipLink({ label }: SkipLinkProps) {
  const [focused, setFocused] = useState(false);

  return (
    <a
      href="#main-content"
      className={
        focused
          ? "fixed inset-inline-start-2 top-2 z-(--z-banner) rounded-md bg-background px-4 py-2 text-sm font-medium text-foreground underline outline-3 outline-ring outline-offset-2"
          : "sr-only"
      }
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
    >
      {label}
    </a>
  );
}
