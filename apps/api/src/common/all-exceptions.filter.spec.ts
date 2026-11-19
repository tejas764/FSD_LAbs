import {
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { AllExceptionsFilter } from "./all-exceptions.filter";

describe("AllExceptionsFilter", () => {
  let filter: AllExceptionsFilter;
  let errorSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;

  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

  function makeHost(statusCode = 200): ArgumentsHost {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ method: "POST", url: "/api/v1/reports" }),
        getResponse: () => ({ status: mockStatus, statusCode }),
      }),
    } as unknown as ArgumentsHost;
  }

  beforeEach(() => {
    filter = new AllExceptionsFilter();
    errorSpy = jest
      .spyOn(Logger.prototype, "error")
      .mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, "warn").mockImplementation(() => {});
    mockJson.mockClear();
    mockStatus.mockClear();
    mockStatus.mockReturnValue({ json: mockJson });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("returns the HttpException status and message for known HTTP errors", () => {
    const exception = new HttpException("Not found", HttpStatus.NOT_FOUND);
    filter.catch(exception, makeHost());

    expect(mockStatus).toHaveBeenCalledWith(404);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 404,
        message: "Not found",
      }),
    );
  });

  it("returns 500 for unknown errors", () => {
    const exception = new Error("unexpected boom");
    filter.catch(exception, makeHost());

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 500 }),
    );
  });

  it("logs unknown errors at error level with stack trace", () => {
    const exception = new Error("db connection lost");
    filter.catch(exception, makeHost());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    const args = errorSpy.mock.calls[0];
    expect(args[0]).toContain("db connection lost");
  });

  it("logs HttpException 4xx at warn level, not error", () => {
    const exception = new HttpException("bad input", HttpStatus.BAD_REQUEST);
    filter.catch(exception, makeHost());

    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("logs HttpException 5xx at error level", () => {
    const exception = new HttpException(
      "gateway timeout",
      HttpStatus.GATEWAY_TIMEOUT,
    );
    filter.catch(exception, makeHost());

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it("includes path and method in the response body", () => {
    const exception = new HttpException("forbidden", HttpStatus.FORBIDDEN);
    filter.catch(exception, makeHost());

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/v1/reports",
        method: "POST",
      }),
    );
  });

  it("uses nested error.message from HttpException responses", () => {
    const exception = new UnauthorizedException({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Unauthorized",
      },
    });

    filter.catch(exception, makeHost(401));

    expect(mockStatus).toHaveBeenCalledWith(401);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        statusCode: 401,
        message: "Unauthorized",
      }),
    );
  });
});
