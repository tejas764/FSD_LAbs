jest.mock("@thallesp/nestjs-better-auth", () => ({
  AuthGuard: class MockAuthGuard {
    canActivate() {
      return true;
    }
  },
}));

import { AnalyticsController } from "./analytics.controller";
import type { AnalyticsService } from "./analytics.service";

describe("AnalyticsController", () => {
  it("passes custom date range queries through to the service", async () => {
    const getSummary = jest.fn().mockResolvedValue({ success: true, data: {} });
    const service = { getSummary } as unknown as AnalyticsService;
    const controller = new AnalyticsController(service);

    await controller.getSummary("c-1", undefined, "2026-03-01", "2026-03-31");

    expect(getSummary).toHaveBeenCalledWith({
      crisisId: "c-1",
      dateFrom: new Date("2026-03-01"),
      dateTo: new Date("2026-03-31"),
    });
  });
});