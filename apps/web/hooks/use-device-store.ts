"use client";

import { useCallback, useEffect, useState } from "react";
import type { z } from "zod";

const CHANGE_EVENT = "crisismap:device-store";

/** Validate before committing, and never claim a write succeeded when storage is full. */
export function useDeviceStore<T>(
  key: string,
  schema: z.ZodType<T>,
  initial: T,
) {
  const [value, setValue] = useState<T>(initial);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function read() {
      try {
        const raw = localStorage.getItem(key);
        setValue(raw === null ? initial : schema.parse(JSON.parse(raw)));
        setError(null);
      } catch {
        setError(
          "Device storage could not be read. Existing data has been kept; check browser storage permissions.",
        );
      } finally {
        setReady(true);
      }
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) read();
    };
    const onChange = (event: Event) => {
      if ((event as CustomEvent<string>).detail === key) read();
    };
    read();
    window.addEventListener("storage", onStorage);
    window.addEventListener(CHANGE_EVENT, onChange);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(CHANGE_EVENT, onChange);
    };
  }, [key, schema, initial]);

  const save = useCallback(
    (next: T | ((previous: T) => T)) => {
      if (!ready || error)
        throw new Error(error || "Device storage is still loading.");
      // Read current storage so edits made in another tab are preserved.
      const raw = localStorage.getItem(key);
      const current = raw === null ? initial : schema.parse(JSON.parse(raw));
      const parsed = schema.parse(
        typeof next === "function"
          ? (next as (previous: T) => T)(current)
          : next,
      );
      localStorage.setItem(key, JSON.stringify(parsed));
      setValue(parsed);
      window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: key }));
    },
    [key, schema, initial, ready, error],
  );

  return { value, save, ready, error };
}
