import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from "@nestjs/common";
import jwt from "jsonwebtoken";
import { ErrorCode } from "../../src/common/error-codes";

const OPTIONAL_AUTH_KEY = "better-auth:optional";

@Injectable()
export class AuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<{
      headers?: Record<string, string | string[] | undefined>;
      user?: { id?: string; role?: string };
    }>();

    const rawAuth = request.headers?.authorization;
    const authHeader = Array.isArray(rawAuth) ? rawAuth[0] : rawAuth;
    const isOptional =
      Reflect.getMetadata(OPTIONAL_AUTH_KEY, context.getHandler()) === true ||
      Reflect.getMetadata(OPTIONAL_AUTH_KEY, context.getClass()) === true;

    if (!authHeader?.startsWith("Bearer ")) {
      if (isOptional) {
        return true;
      }
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: "Unauthorized",
        },
      });
    }

    const token = authHeader.slice("Bearer ".length);

    const payload = jwt.decode(token) as { sub?: string; role?: string } | null;

    if (!payload || typeof payload !== "object") {
      throw new UnauthorizedException({
        success: false,
        error: {
          code: ErrorCode.UNAUTHORIZED,
          message: "Unauthorized",
        },
      });
    }

    request.user = {
      id: payload.sub,
      role: payload.role,
    };

    return true;
  }
}

export class AuthModule {
  static forRootAsync() {
    return {
      module: AuthModule,
    };
  }
}

export function OptionalAuth(): MethodDecorator {
  return SetMetadata(OPTIONAL_AUTH_KEY, true);
}
