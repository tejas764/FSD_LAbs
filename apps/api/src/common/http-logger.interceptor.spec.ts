import { CallHandler, ExecutionContext, Logger } from "@nestjs/common";
import { Observable, of, throwError } from "rxjs";
import { HttpLoggerInterceptor } from "./http-logger.interceptor";

describe("HttpLoggerInterceptor", () => {
  let interceptor: HttpLoggerInterceptor;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    interceptor = new HttpLoggerInterceptor();
    logSpy = jest.spyOn(Logger.prototype, "log").mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function makeContext(method: string, url: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method, url }),
        getResponse: () => ({ statusCode: 200 }),
      }),
    } as unknown as ExecutionContext;
  }

  function makeHandler(obs: Observable<unknown>): CallHandler {
    return { handle: () => obs } as CallHandler;
  }

  it("logs completed requests with method, url, status and duration", (done) => {
    const ctx = makeContext("GET", "/api/v1/health");
    const handler = makeHandler(of({ ok: true }));

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        expect(logSpy).toHaveBeenCalledTimes(1);
        const msg = logSpy.mock.calls[0][0] as string;
        expect(msg).toContain("GET");
        expect(msg).toContain("/api/v1/health");
        expect(msg).toContain("200");
        expect(msg).toMatch(/\d+ms/);
        done();
      },
    });
  });

  it("uses warn level for 4xx responses", (done) => {
    const ctx = {
      switchToHttp: () => ({
        getRequest: () => ({ method: "POST", url: "/api/v1/crises" }),
        getResponse: () => ({ statusCode: 400 }),
      }),
    } as unknown as ExecutionContext;
    const handler = makeHandler(of({}));

    interceptor.intercept(ctx, handler).subscribe({
      complete: () => {
        expect(warnSpy).toHaveBeenCalledTimes(1);
        const msg = warnSpy.mock.calls[0][0] as string;
        expect(msg).toContain("400");
        done();
      },
    });
  });

  it("still emits the value downstream", (done) => {
    const ctx = makeContext("GET", "/api/v1/reports");
    const handler = makeHandler(of({ data: [] }));
    const values: unknown[] = [];

    interceptor.intercept(ctx, handler).subscribe({
      next: (v: unknown) => values.push(v),
      complete: () => {
        expect(values).toEqual([{ data: [] }]);
        done();
      },
    });
  });

  it("propagates errors downstream without swallowing", (done) => {
    const ctx = makeContext("POST", "/api/v1/reports");
    const err = new Error("boom");
    const handler = makeHandler(throwError(() => err));

    interceptor.intercept(ctx, handler).subscribe({
      error: (e: unknown) => {
        expect(e).toBe(err);
        done();
      },
    });
  });
});
