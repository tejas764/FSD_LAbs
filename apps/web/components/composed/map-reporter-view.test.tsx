// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import React from "react";

// ─── mocks ───────────────────────────────────────────────────────────────────

// Capture the onBoundsChange prop so tests can trigger it
let capturedOnBoundsChange: ((bounds: string) => void) | undefined;

vi.mock("next/dynamic", () => ({
  default: () =>
    (props: { onBoundsChange?: (b: string) => void }) => {
      capturedOnBoundsChange = props.onBoundsChange;
      return <div data-testid="leaflet-map" />;
    },
}));

const streamMock = vi.hoisted(() => {
  type Listener = (event: MessageEvent) => void;
  const listeners = new Map<string, Set<Listener>>();
  return {
    addEventListener: vi.fn((eventName: string, listener: Listener) => {
      const existing = listeners.get(eventName) ?? new Set<Listener>();
      existing.add(listener);
      listeners.set(eventName, existing);
    }),
    removeEventListener: vi.fn((eventName: string, listener: Listener) => {
      listeners.get(eventName)?.delete(listener);
    }),
    close: vi.fn(),
    emit(eventName: string, payload: unknown) {
      const event = { data: JSON.stringify(payload) } as MessageEvent;
      listeners.get(eventName)?.forEach((l) => l(event));
    },
    reset() {
      listeners.clear();
      this.addEventListener.mockClear();
      this.removeEventListener.mockClear();
      this.close.mockClear();
    },
  };
});

vi.mock("@/lib/api/client", () => ({
  apiClient: {
    reports: {
      list: vi.fn(),
      stream: vi.fn(),
      publicStream: vi.fn(),
    },
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

vi.mock("@/components/ui/skeleton", () => ({
  Skeleton: ({ className }: { className?: string }) => (
    <div data-testid="skeleton" className={className} />
  ),
}));

// ─── imports after mocks ──────────────────────────────────────────────────────

import { apiClient } from "@/lib/api/client";
import { MapReporterView } from "./map-reporter-view";

// ─── helpers ──────────────────────────────────────────────────────────────────

const makeFeatureCollection = (ids: string[]) => ({
  type: "FeatureCollection" as const,
  features: ids.map((id) => ({
    id,
    type: "Feature" as const,
    geometry: { type: "Point" as const, coordinates: [10, 20] as [number, number] },
    properties: {
      crisisId: "crisis1",
      damageLevel: "MINIMAL" as const,
      submittedAt: new Date().toISOString(),
      isDuplicate: false,
      version: 1,
      crisisType: "FLOOD" as const,
    },
  })),
  meta: { limit: 100, total: ids.length, nextCursor: null },
});

// ─── tests ───────────────────────────────────────────────────────────────────

describe("MapReporterView — viewport-driven fetch", () => {
  beforeEach(() => {
    capturedOnBoundsChange = undefined;
    vi.useFakeTimers();
    vi.mocked(apiClient.reports.list).mockResolvedValue(
      makeFeatureCollection(["r1", "r2"]),
    );
    vi.mocked(apiClient.reports.stream).mockReturnValue(streamMock as unknown as EventSource);
    streamMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("fetches reports with bounds when map viewport changes", async () => {
    const onFeaturesLoaded = vi.fn();
    render(<MapReporterView aria-label="test map" onFeaturesLoaded={onFeaturesLoaded} />);

    // Map fires initial bounds
    act(() => {
      capturedOnBoundsChange?.("-10,-10,10,10");
    });

    // Advance past debounce
    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(apiClient.reports.list).toHaveBeenCalledWith({ bounds: "-10,-10,10,10" });
    expect(onFeaturesLoaded).toHaveBeenCalledTimes(1);
    const features = onFeaturesLoaded.mock.calls[0][0] as Array<{ id: string }>;
    expect(features.map((f) => f.id)).toEqual(["r1", "r2"]);
  });

  it("passes date range and damage filters to the reports API", async () => {
    render(
      <MapReporterView
        aria-label="test map"
        crisisId="crisis1"
        dateFrom="2026-04-01"
        dateTo="2026-04-30"
        damageFilter="COMPLETE"
      />,
    );

    act(() => {
      capturedOnBoundsChange?.("-10,-10,10,10");
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(apiClient.reports.list).toHaveBeenCalledWith({
      bounds: "-10,-10,10,10",
      crisisId: "crisis1",
      dateFrom: "2026-04-01",
      dateTo: "2026-04-30",
      damageLevel: "COMPLETE",
    });
  });

  it("debounces rapid bounds changes to a single fetch", async () => {
    render(<MapReporterView aria-label="test map" />);

    act(() => {
      capturedOnBoundsChange?.("-5,-5,5,5");
      capturedOnBoundsChange?.("-6,-6,6,6");
      capturedOnBoundsChange?.("-7,-7,7,7");
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    // Only the last bounds value triggers a fetch
    expect(apiClient.reports.list).toHaveBeenCalledTimes(1);
    expect(apiClient.reports.list).toHaveBeenCalledWith({ bounds: "-7,-7,7,7" });
  });

  it("shows stale indicator when fetch fails", async () => {
    vi.mocked(apiClient.reports.list).mockRejectedValueOnce(new Error("network"));

    const { getByRole } = render(<MapReporterView aria-label="test map" />);

    act(() => { capturedOnBoundsChange?.("0,0,1,1"); });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(getByRole("status")).toBeInTheDocument();
  });

  it("does not call reports.list before bounds are received", () => {
    render(<MapReporterView aria-label="test map" />);
    expect(apiClient.reports.list).not.toHaveBeenCalled();
  });

  it("does not call reports.list when bounds is an empty string", async () => {
    render(<MapReporterView aria-label="test map" />);

    act(() => {
      capturedOnBoundsChange?.("");
    });

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(apiClient.reports.list).not.toHaveBeenCalled();
  });

  it("cancels pending debounced fetch on unmount", async () => {
    const { unmount } = render(<MapReporterView aria-label="test map" />);

    act(() => {
      capturedOnBoundsChange?.("-10,-10,10,10");
    });

    unmount();

    await act(async () => {
      vi.advanceTimersByTime(500);
      await Promise.resolve();
    });

    expect(apiClient.reports.list).not.toHaveBeenCalled();
  });

  it("positions the legend at the bottom-end by default (avoids FAB and sidebar)", () => {
    render(<MapReporterView aria-label="test map" />);

    const legend = screen.getByRole("region", { name: "reporter.map.legend_label" });
    const legendWrapper = legend.parentElement;

    expect(legendWrapper).toBeInTheDocument();
    expect(legendWrapper).toHaveClass("absolute", "bottom-[88px]", "end-4", "z-[400]", "pointer-events-none");
  });

  it("renders legend at custom position when legendClassName is provided", () => {
    render(<MapReporterView aria-label="test map" legendClassName="bottom-4 start-4" />);

    const legend = screen.getByRole("region", { name: "reporter.map.legend_label" });
    const legendWrapper = legend.parentElement;

    expect(legendWrapper).toHaveClass("bottom-4", "start-4");
  });
});

// ─── SSE real-time tests ──────────────────────────────────────────────────────

describe("MapReporterView — SSE real-time updates", () => {
  beforeEach(() => {
    capturedOnBoundsChange = undefined;
    vi.useFakeTimers();
    vi.mocked(apiClient.reports.list).mockResolvedValue(
      makeFeatureCollection(["r1", "r2"]),
    );
    vi.mocked(apiClient.reports.stream).mockReturnValue(streamMock as unknown as EventSource);
    vi.mocked(apiClient.reports.publicStream).mockReturnValue(streamMock as unknown as EventSource);
    streamMock.reset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("subscribes to stream when crisisId is set and role is not REPORTER", () => {
    render(<MapReporterView aria-label="test map" crisisId="crisis-1" />);
    expect(apiClient.reports.stream).toHaveBeenCalledWith("crisis-1");
    expect(streamMock.addEventListener).toHaveBeenCalledWith("report.updated", expect.any(Function));
  });

  it("uses publicStream when role is REPORTER and crisisId is set", () => {
    render(<MapReporterView aria-label="test map" crisisId="crisis-1" role="REPORTER" />);
    expect(apiClient.reports.publicStream).toHaveBeenCalledWith("crisis-1");
    expect(apiClient.reports.stream).not.toHaveBeenCalled();
    expect(streamMock.addEventListener).toHaveBeenCalledWith("report.updated", expect.any(Function));
  });

  it("does not subscribe to any stream when crisisId is not set", () => {
    render(<MapReporterView aria-label="test map" />);
    expect(apiClient.reports.stream).not.toHaveBeenCalled();
    expect(apiClient.reports.publicStream).not.toHaveBeenCalled();
  });

  it("calls onLiveStatusChange(true) when ready event fires", () => {
    const onLiveStatusChange = vi.fn();
    render(
      <MapReporterView
        aria-label="test map"
        crisisId="crisis-1"
        onLiveStatusChange={onLiveStatusChange}
      />,
    );
    act(() => { streamMock.emit("ready", { crisisId: "crisis-1" }); });
    expect(onLiveStatusChange).toHaveBeenCalledWith(true);
  });

  it("calls onLiveStatusChange(false) when error event fires", () => {
    const onLiveStatusChange = vi.fn();
    render(
      <MapReporterView
        aria-label="test map"
        crisisId="crisis-1"
        onLiveStatusChange={onLiveStatusChange}
      />,
    );
    act(() => { streamMock.emit("error", {}); });
    expect(onLiveStatusChange).toHaveBeenCalledWith(false);
  });

  it("calls onLiveStatusChange(false) on unmount", () => {
    const onLiveStatusChange = vi.fn();
    const { unmount } = render(
      <MapReporterView
        aria-label="test map"
        crisisId="crisis-1"
        onLiveStatusChange={onLiveStatusChange}
      />,
    );
    unmount();
    expect(onLiveStatusChange).toHaveBeenCalledWith(false);
  });

  it("refetches reports on report.updated event", async () => {
    render(<MapReporterView aria-label="test map" crisisId="crisis-1" />);

    // Simulate bounds arriving so boundsRef is populated
    act(() => { capturedOnBoundsChange?.("-10,-10,10,10"); });
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });
    vi.mocked(apiClient.reports.list).mockClear();

    act(() => { streamMock.emit("report.updated", { crisisId: "crisis-1" }); });
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });

    expect(apiClient.reports.list).toHaveBeenCalledWith(
      expect.objectContaining({ bounds: "-10,-10,10,10", crisisId: "crisis-1" }),
    );
  });

  it("does not refetch on report.updated when no bounds have been received yet", async () => {
    render(<MapReporterView aria-label="test map" crisisId="crisis-1" />);

    act(() => { streamMock.emit("report.updated", { crisisId: "crisis-1" }); });
    await act(async () => { vi.advanceTimersByTime(500); await Promise.resolve(); });

    expect(apiClient.reports.list).not.toHaveBeenCalled();
  });

  it("closes the stream on unmount", () => {
    const { unmount } = render(<MapReporterView aria-label="test map" crisisId="crisis-1" />);
    unmount();
    expect(streamMock.close).toHaveBeenCalled();
    expect(streamMock.removeEventListener).toHaveBeenCalledWith("report.updated", expect.any(Function));
  });

  it("closes old stream and opens new one when crisisId changes", () => {
    const { rerender } = render(<MapReporterView aria-label="test map" crisisId="crisis-1" />);
    expect(apiClient.reports.stream).toHaveBeenCalledWith("crisis-1");

    rerender(<MapReporterView aria-label="test map" crisisId="crisis-2" />);

    expect(streamMock.close).toHaveBeenCalled();
    expect(apiClient.reports.stream).toHaveBeenCalledWith("crisis-2");
  });
});



