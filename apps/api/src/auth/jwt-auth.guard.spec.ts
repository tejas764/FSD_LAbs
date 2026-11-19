import { ExecutionContext, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { sign } from "jsonwebtoken";

describe("JwtAuthGuard", () => {
  function buildContext(authHeader?: string): ExecutionContext {
    const headers: Record<string, unknown> = {};
    if (typeof authHeader !== "undefined") {
      headers.authorization = authHeader;
    }

    return {
      switchToHttp: () => ({
        getRequest: () => ({ headers }),
      }),
    } as unknown as ExecutionContext;
  }

  it("throws UnauthorizedException when authorization header is missing", () => {
    const guard = new JwtAuthGuard({
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "BETTER_AUTH_SECRET") {
          return "test-secret";
        }
        return undefined;
      }),
    } as unknown as ConfigService);

    expect(() => guard.canActivate(buildContext())).toThrow(
      UnauthorizedException,
    );
  });

  it("attaches user payload when token is valid", () => {
    const guard = new JwtAuthGuard({
      get: jest.fn().mockImplementation((key: string) => {
        if (key === "BETTER_AUTH_SECRET") {
          return "test-secret";
        }
        return undefined;
      }),
    } as unknown as ConfigService);

    const token = sign(
      {
        sub: "admin-1",
        role: "admin",
      },
      "test-secret",
      {
        algorithm: "HS256",
      },
    );

    const request: { headers: Record<string, unknown>; user?: unknown } = {
      headers: { authorization: `Bearer ${token}` },
    };

    const context = {
      switchToHttp: () => ({
        getRequest: () => request,
      }),
    } as unknown as ExecutionContext;

    expect(guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual(
      expect.objectContaining({ sub: "admin-1", role: "admin" }),
    );
  });
});
