// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { useDeviceStore } from "./use-device-store";

const schema = z.object({ notes: z.string(), checked: z.array(z.string()) });
const initial = { notes: "", checked: [] as string[] };
const key = "test:device-store";

describe("device-local planning data", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("preserves changes made in a second tab before applying an update", async () => {
    const { result } = renderHook(() => useDeviceStore(key, schema, initial));
    await waitFor(() => expect(result.current.ready).toBe(true));
    localStorage.setItem(
      key,
      JSON.stringify({ notes: "updated in another tab", checked: [] }),
    );
    act(() =>
      result.current.save((previous) => ({ ...previous, checked: ["water"] })),
    );
    expect(result.current.value).toEqual({
      notes: "updated in another tab",
      checked: ["water"],
    });
  });

  it("keeps corrupt saved data intact and blocks replacement", async () => {
    localStorage.setItem(key, "corrupt original data");
    const { result } = renderHook(() => useDeviceStore(key, schema, initial));
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(() => result.current.save(initial)).toThrow();
    expect(localStorage.getItem(key)).toBe("corrupt original data");
  });

  it("does not update the displayed value when browser storage rejects a write", async () => {
    const { result } = renderHook(() => useDeviceStore(key, schema, initial));
    await waitFor(() => expect(result.current.ready).toBe(true));
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new DOMException("Storage full", "QuotaExceededError");
    });
    expect(() =>
      result.current.save({ notes: "not saved", checked: [] }),
    ).toThrow();
    expect(result.current.value).toEqual(initial);
  });
});
