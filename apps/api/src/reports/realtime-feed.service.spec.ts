import { RealtimeFeedService } from "./realtime-feed.service";

describe("RealtimeFeedService", () => {
  it("notifies subscribers for matching crisis", () => {
    const service = new RealtimeFeedService();
    const listener = jest.fn();

    const unsubscribe = service.subscribe("crisis-1", listener);
    service.emitReportUpdate({
      reportId: "report-1",
      crisisId: "crisis-1",
      submittedAt: "2026-01-01T00:00:00.000Z",
      version: 2,
      isDuplicate: false,
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ reportId: "report-1", crisisId: "crisis-1" }),
    );

    unsubscribe();
  });

  it("does not notify subscribers for other crises", () => {
    const service = new RealtimeFeedService();
    const listener = jest.fn();

    service.subscribe("crisis-1", listener);
    service.emitReportUpdate({
      reportId: "report-2",
      crisisId: "crisis-2",
      submittedAt: "2026-01-01T00:00:00.000Z",
      version: 1,
      isDuplicate: false,
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("notifies export complete subscribers for matching crisis", () => {
    const service = new RealtimeFeedService();
    const listener = jest.fn();

    const unsubscribe = service.subscribeExportComplete("crisis-1", listener);
    service.emitExportComplete({
      jobId: "42",
      crisisId: "crisis-1",
      downloadUrl: "https://example.com/exports/42.csv?sig=abc",
    });

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({ jobId: "42", crisisId: "crisis-1" }),
    );

    unsubscribe();
  });

  it("does not notify export complete subscribers for other crises", () => {
    const service = new RealtimeFeedService();
    const listener = jest.fn();

    service.subscribeExportComplete("crisis-1", listener);
    service.emitExportComplete({
      jobId: "99",
      crisisId: "crisis-2",
      downloadUrl: "https://example.com/exports/99.csv?sig=xyz",
    });

    expect(listener).not.toHaveBeenCalled();
  });

  it("unsubscribing export complete stops further notifications", () => {
    const service = new RealtimeFeedService();
    const listener = jest.fn();

    const unsubscribe = service.subscribeExportComplete("crisis-1", listener);
    unsubscribe();

    service.emitExportComplete({
      jobId: "55",
      crisisId: "crisis-1",
      downloadUrl: "https://example.com/exports/55.csv?sig=def",
    });

    expect(listener).not.toHaveBeenCalled();
  });
});
