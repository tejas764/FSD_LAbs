jest.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class AuthGuard {},
  OptionalAuth: () => () => undefined,
}));

import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { RealtimeFeedService } from "./realtime-feed.service";
import { GUARDS_METADATA } from "@nestjs/common/constants";
import { AuthGuard } from "@thallesp/nestjs-better-auth";

describe("ReportsController SSE", () => {
  it("sets SSE headers and subscribes by crisis id", () => {
    const reportsService = {} as ReportsService;
    const unsubscribe = jest.fn();
    const unsubscribeExport = jest.fn();
    const realtimeFeed = {
      subscribe: jest.fn().mockReturnValue(unsubscribe),
      subscribeExportComplete: jest.fn().mockReturnValue(unsubscribeExport),
    } as unknown as RealtimeFeedService;

    const controller = new ReportsController(reportsService, realtimeFeed);

    let onClose: (() => void) | undefined;
    const response = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === "close") {
          onClose = cb;
        }
      }),
    };

    controller.streamReports("crisis-1", response as never);

    expect(response.setHeader).toHaveBeenCalledWith(
      "Content-Type",
      "text/event-stream",
    );
    expect(response.setHeader).toHaveBeenCalledWith(
      "Cache-Control",
      "no-cache, no-transform",
    );
    expect(realtimeFeed.subscribe).toHaveBeenCalledWith(
      "crisis-1",
      expect.any(Function),
    );
    expect(realtimeFeed.subscribeExportComplete).toHaveBeenCalledWith(
      "crisis-1",
      expect.any(Function),
    );

    onClose?.();
    expect(unsubscribe).toHaveBeenCalled();
    expect(unsubscribeExport).toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });
});

describe("ReportsController auth guards", () => {
  it("uses AuthGuard for createExport", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ReportsController.prototype.createExport,
    ) as unknown[];

    expect(guards).toEqual(expect.arrayContaining([AuthGuard]));
  });

  it("uses AuthGuard for getExportStatus", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ReportsController.prototype.getExportStatus,
    ) as unknown[];

    expect(guards).toEqual(expect.arrayContaining([AuthGuard]));
  });

  it("uses AuthGuard for getModerationAudit", () => {
    const guards = Reflect.getMetadata(
      GUARDS_METADATA,
      ReportsController.prototype.getModerationAudit,
    ) as unknown[];

    expect(guards).toEqual(expect.arrayContaining([AuthGuard]));
  });
});

describe("ReportsController createExport validation", () => {
  const makeResponse = () => {
    const response = {
      status: jest.fn(),
    };
    return response;
  };

  it("rejects non-admin all-crises export without crisisId", async () => {
    const reportsService = {
      createExportJob: jest.fn(),
    } as unknown as ReportsService;
    const realtimeFeed = {} as RealtimeFeedService;
    const controller = new ReportsController(reportsService, realtimeFeed);
    const response = makeResponse();

    const result = await controller.createExport(
      {
        format: "csv",
      },
      { user: { role: "analyst" } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
      }),
    );
  });

  it("rejects admin all-crises export without date range", async () => {
    const reportsService = {
      createExportJob: jest.fn(),
    } as unknown as ReportsService;
    const realtimeFeed = {} as RealtimeFeedService;
    const controller = new ReportsController(reportsService, realtimeFeed);
    const response = makeResponse();

    const result = await controller.createExport(
      {
        format: "csv",
      },
      { user: { role: "admin" } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
      }),
    );
  });

  it("queues admin all-crises csv export with a date range longer than 30 days", async () => {
    const reportsService = {
      createExportJob: jest.fn().mockResolvedValue({ jobId: "job-csv-wide" }),
    } as unknown as ReportsService;
    const realtimeFeed = {} as RealtimeFeedService;
    const controller = new ReportsController(reportsService, realtimeFeed);
    const response = makeResponse();

    const result = await controller.createExport(
      {
        format: "csv",
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-02-10T00:00:00.000Z",
      },
      { user: { role: "admin" } } as never,
      response as never,
    );

    expect((reportsService as unknown as { createExportJob: jest.Mock }).createExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        crisisId: undefined,
        format: "csv",
      }),
    );
    expect(result).toEqual({ jobId: "job-csv-wide" });
  });

  it("rejects admin all-crises shapefile export when date range exceeds 30 days", async () => {
    const reportsService = {
      createExportJob: jest.fn(),
    } as unknown as ReportsService;
    const realtimeFeed = {} as RealtimeFeedService;
    const controller = new ReportsController(reportsService, realtimeFeed);
    const response = makeResponse();

    const result = await controller.createExport(
      {
        format: "shapefile",
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-02-10T00:00:00.000Z",
      },
      { user: { role: "admin" } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
      }),
    );
  });

  it("rejects admin all-crises csv export when date range exceeds 365 days", async () => {
    const reportsService = {
      createExportJob: jest.fn(),
    } as unknown as ReportsService;
    const realtimeFeed = {} as RealtimeFeedService;
    const controller = new ReportsController(reportsService, realtimeFeed);
    const response = makeResponse();

    const result = await controller.createExport(
      {
        format: "csv",
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2027-02-10T00:00:00.000Z",
      },
      { user: { role: "admin" } } as never,
      response as never,
    );

    expect(response.status).toHaveBeenCalledWith(400);
    expect(result).toEqual(
      expect.objectContaining({
        success: false,
      }),
    );
  });

  it("queues admin all-crises export with bounded date range", async () => {
    const reportsService = {
      createExportJob: jest.fn().mockResolvedValue({ jobId: "job-all" }),
    } as unknown as ReportsService;
    const realtimeFeed = {} as RealtimeFeedService;
    const controller = new ReportsController(reportsService, realtimeFeed);
    const response = makeResponse();

    const result = await controller.createExport(
      {
        format: "csv",
        dateFrom: "2026-01-01T00:00:00.000Z",
        dateTo: "2026-01-15T00:00:00.000Z",
      },
      { user: { role: "admin" } } as never,
      response as never,
    );

    expect((reportsService as unknown as { createExportJob: jest.Mock }).createExportJob).toHaveBeenCalledWith(
      expect.objectContaining({
        crisisId: undefined,
        format: "csv",
      }),
    );
    expect(result).toEqual({ jobId: "job-all" });
  });
});

// ─── Public SSE stream (unauthenticated) ─────────────────────────────────────

describe("ReportsController public SSE stream", () => {
  function makeController() {
    const reportsService = {} as ReportsService;
    const unsubscribe = jest.fn();
    const realtimeFeed = {
      subscribe: jest.fn().mockReturnValue(unsubscribe),
      subscribeExportComplete: jest.fn(),
    } as unknown as RealtimeFeedService;

    const controller = new ReportsController(reportsService, realtimeFeed);
    return { controller, realtimeFeed, unsubscribe };
  }

  function makeResponse() {
    let onClose: (() => void) | undefined;
    const response = {
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn().mockImplementation((event: string, cb: () => void) => {
        if (event === "close") onClose = cb;
      }),
      getOnClose: () => onClose,
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };
    return response;
  }

  it("sets SSE headers and emits ready event", () => {
    const { controller } = makeController();
    const response = makeResponse();

    controller.streamReportsPublic("crisis-1", response as never);

    expect(response.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(response.write).toHaveBeenCalledWith(
      expect.stringContaining("event: ready"),
    );
    response.getOnClose()?.();
  });

  it("subscribes to realtime feed by crisisId", () => {
    const { controller, realtimeFeed } = makeController();
    const response = makeResponse();

    controller.streamReportsPublic("crisis-1", response as never);

    expect(realtimeFeed.subscribe).toHaveBeenCalledWith("crisis-1", expect.any(Function));
    response.getOnClose()?.();
  });

  it("does NOT subscribe to export events (public stream only sends report.updated)", () => {
    const { controller, realtimeFeed } = makeController();
    const response = makeResponse();

    controller.streamReportsPublic("crisis-1", response as never);

    expect(realtimeFeed.subscribeExportComplete).not.toHaveBeenCalled();
    response.getOnClose()?.();
  });

  it("unsubscribes and ends response on close", () => {
    const { controller, unsubscribe } = makeController();
    const response = makeResponse();

    controller.streamReportsPublic("crisis-1", response as never);
    response.getOnClose()?.();

    expect(unsubscribe).toHaveBeenCalled();
    expect(response.end).toHaveBeenCalled();
  });

  it("returns 400 when crisisId is missing", () => {
    const { controller } = makeController();
    const response = makeResponse();

    controller.streamReportsPublic(undefined, response as never);

    expect(response.status).toHaveBeenCalledWith(400);
  });

  it("has no auth guard (public route)", () => {
    const { GUARDS_METADATA } = require("@nestjs/common/constants");
    const { AuthGuard } = require("@thallesp/nestjs-better-auth");
    const guards: unknown[] | undefined = Reflect.getMetadata(
      GUARDS_METADATA,
      ReportsController.prototype.streamReportsPublic,
    );
    // No AuthGuard on the public endpoint
    expect(guards ?? []).not.toEqual(expect.arrayContaining([AuthGuard]));
  });
});
