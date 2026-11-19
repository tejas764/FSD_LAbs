import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { ErrorCode } from "../common/error-codes";
import { ROLES_KEY } from "./roles.decorator";

type RequestWithUser = {
  user?: {
    role?: string;
  };
};

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userRole = request.user?.role?.trim().toLowerCase();
    const normalizedRequiredRoles = requiredRoles.map((role) => role.trim().toLowerCase());

    if (!userRole || !normalizedRequiredRoles.includes(userRole)) {
      throw new ForbiddenException({
        success: false,
        error: {
          code: ErrorCode.FORBIDDEN,
          message: "Forbidden",
        },
      });
    }

    return true;
  }
}
