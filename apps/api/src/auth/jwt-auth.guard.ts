import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verify } from "jsonwebtoken";
import { ErrorCode } from "../common/error-codes";

type JwtPayload = {
  sub?: string;
  role?: string;
  [key: string]: unknown;
};

type RequestWithAuth = {
  headers: Record<string, unknown>;
  user?: JwtPayload;
};

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const authHeader = request.headers.authorization;
    const secret = this.configService.get<string>("BETTER_AUTH_SECRET", "");

    if (!secret || typeof authHeader !== "string") {
      this.throwUnauthorized();
    }

    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length)
      : "";

    if (!token) {
      this.throwUnauthorized();
    }

    try {
      const issuer = this.configService.get<string>("BETTER_AUTH_JWT_ISSUER");
      const audience = this.configService.get<string>("BETTER_AUTH_JWT_AUDIENCE");

      const payload = verify(token, secret, {
        algorithms: ["HS256"],
        issuer: issuer || undefined,
        audience: audience || undefined,
      }) as JwtPayload;

      request.user = payload;
      return true;
    } catch {
      this.throwUnauthorized();
    }
  }

  private throwUnauthorized(): never {
    throw new UnauthorizedException({
      success: false,
      error: {
        code: ErrorCode.UNAUTHORIZED,
        message: "Unauthorized",
      },
    });
  }
}
