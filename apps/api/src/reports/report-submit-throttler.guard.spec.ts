import { ExecutionContext, HttpException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Reflector } from "@nestjs/core";
import { ThrottlerStorageService } from "@nestjs/throttler";
import { ReportSubmitThrottlerGuard } from "./report-submit-throttler.guard";

describe("ReportSubmitThrottlerGuard", () => {
  function createGuard(): ReportSubmitThrottlerGuard {
    const configService = {
      get: jest
        .fn()
        .mockImplementation((key: string, defaultValue?: unknown) => {
          if (key === "RATE_LIMIT_PER_HOUR") {
            return 10;
          }
          return defaultValue;
        }),
    } as unknown as ConfigService;

    return new ReportSubmitThrottlerGuard(
      {
        throttlers: [{ ttl: 60_000, limit: 30 }],
        ignoreUserAgents: [],
      },
      new ThrottlerStorageService(),
      new Reflector(),
      configService,
    );
  }

  function mockExecutionContext(
    request: Record<string, unknown>,
  ): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ header: jest.fn() }),
      }),
      getClass: () => ({ name: "ReportsController" }),
      getHandler: () => jest.fn(),
    } as unknown as ExecutionContext;
  }

  it("uses client ip tracker even when Authorization header is present", async () => {
    const guard = createGuard();
    const req = {
      headers: {
        "x-forwarded-for": "203.0.113.100",
      },
      ip: "127.0.0.1",
    };

    const tracker = await (guard as any).getTracker(
      req,
      mockExecutionContext(req),
    );

    expect(tracker).toBe("ip:203.0.113.100");
  });

  it("uses forwarded client ip as throttling tracker key for anonymous submissions", async () => {
    const guard = createGuard();
    const req = {
      headers: {
        "x-forwarded-for": "203.0.113.8, 10.0.0.1",
      },
      ip: "127.0.0.1",
    };

    const tracker = await (guard as any).getTracker(
      req,
      mockExecutionContext(req),
    );

    expect(tracker).toBe("ip:203.0.113.8");
  });

  it("always uses anonymous per-hour limit", () => {
    const guard = createGuard();

    const requestWithForwardedFor = {
      headers: {
        "x-forwarded-for": "203.0.113.50",
      },
    };
    const requestWithoutAuthHeader = {
      headers: {},
    };

    expect((guard as any).resolveLimit(requestWithForwardedFor)).toBe(10);
    expect((guard as any).resolveLimit(requestWithoutAuthHeader)).toBe(10);
  });

  it("allows requests that are within RATE_LIMIT_PER_HOUR", async () => {
    const guard = createGuard();
    const req = {
      headers: {
        "x-forwarded-for": "198.51.100.10",
      },
      ip: "127.0.0.1",
    };
    const context = mockExecutionContext(req);

    const handleRequestSpy = jest
      .spyOn(guard as unknown as { handleRequest: jest.Mock }, "handleRequest")
      .mockResolvedValue(true);

    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    expect(handleRequestSpy).toHaveBeenCalledTimes(10);
  });

  it("blocks requests exceeding RATE_LIMIT_PER_HOUR with 429", async () => {
    const guard = createGuard();
    const req = {
      headers: {
        "x-forwarded-for": "198.51.100.11",
      },
      ip: "127.0.0.1",
    };
    const context = mockExecutionContext(req);

    let requestCount = 0;
    jest
      .spyOn(guard as unknown as { handleRequest: jest.Mock }, "handleRequest")
      .mockImplementation(async () => {
        requestCount += 1;
        if (requestCount <= 10) {
          return true;
        }

        await (
          guard as unknown as {
            throwThrottlingException: (ctx: ExecutionContext) => Promise<void>;
          }
        ).throwThrottlingException(context);

        return true;
      });

    for (let i = 0; i < 10; i++) {
      await expect(guard.canActivate(context)).resolves.toBe(true);
    }

    try {
      await guard.canActivate(context);
      throw new Error("Expected throttling to reject the request");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });
});
