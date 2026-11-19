import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RolesGuard } from "./roles.guard";

describe("RolesGuard", () => {
  function buildContext(role?: string): ExecutionContext {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as unknown as ExecutionContext;
  }

  it("allows when route has no role metadata", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(undefined),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext("viewer"))).toBe(true);
  });

  it("throws ForbiddenException when role does not match", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["admin"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(() => guard.canActivate(buildContext("viewer"))).toThrow(
      ForbiddenException,
    );
  });

  it("allows when role matches", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["admin"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext("admin"))).toBe(true);
  });

  it("allows when role matches with different casing", () => {
    const reflector = {
      getAllAndOverride: jest.fn().mockReturnValue(["admin"]),
    } as unknown as Reflector;
    const guard = new RolesGuard(reflector);

    expect(guard.canActivate(buildContext("ADMIN"))).toBe(true);
  });
});
