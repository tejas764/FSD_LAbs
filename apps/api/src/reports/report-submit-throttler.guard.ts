import {
  ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  InjectThrottlerOptions,
  InjectThrottlerStorage,
  ThrottlerGuard,
  ThrottlerModuleOptions,
  ThrottlerOptions,
  ThrottlerStorage,
  ThrottlerRequest,
} from "@nestjs/throttler";
import { Reflector } from "@nestjs/core";
import { ErrorCode } from "../common/error-codes";

type RequestLike = {
  ip?: string;
  ips?: string[];
  headers?: Record<string, unknown>;
};

@Injectable()
export class ReportSubmitThrottlerGuard extends ThrottlerGuard {
  private readonly anonymousLimitPerHour: number;
  private readonly submissionWindowMs = 60 * 60 * 1000;

  constructor(
    @InjectThrottlerOptions() options: ThrottlerModuleOptions,
    @InjectThrottlerStorage() storageService: ThrottlerStorage,
    reflector: Reflector,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {
    super(options, storageService, reflector);
    this.anonymousLimitPerHour = this.configService.get<number>(
      "RATE_LIMIT_PER_HOUR",
      10,
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { req } = this.getRequestResponse(context);
    const request = req as RequestLike;

    const limit = this.resolveLimit(request);
    const throttler: ThrottlerOptions = {
      name: "default",
      ttl: this.submissionWindowMs,
      limit,
    };

    const requestProps: ThrottlerRequest = {
      context,
      limit,
      ttl: this.submissionWindowMs,
      throttler,
      blockDuration: this.submissionWindowMs,
      getTracker: (trackerRequest: Record<string, unknown>) =>
        this.getTracker(trackerRequest as RequestLike),
      generateKey: this.generateKey.bind(this),
    };

    return this.handleRequest(requestProps);
  }

  protected async getTracker(req: RequestLike): Promise<string> {
    return `ip:${this.getClientIp(req)}`;
  }

  protected resolveLimit(_req: RequestLike): number {
    return this.anonymousLimitPerHour;
  }

  protected async throwThrottlingException(
    _context: ExecutionContext,
  ): Promise<void> {
    throw new HttpException(
      {
        success: false,
        error: {
          code: ErrorCode.RATE_LIMIT_EXCEEDED,
          message: "Rate limit exceeded. Please retry later.",
        },
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }

  private getClientIp(req: RequestLike): string {
    if (Array.isArray(req.ips) && req.ips.length > 0) {
      return req.ips[0] ?? "unknown";
    }

    const forwarded = req.headers?.["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.trim().length > 0) {
      return forwarded.split(",")[0]?.trim() || "unknown";
    }

    if (Array.isArray(forwarded) && forwarded.length > 0) {
      const first = forwarded[0];
      if (typeof first === "string" && first.trim().length > 0) {
        return first.split(",")[0]?.trim() || "unknown";
      }
    }

    return req.ip || "unknown";
  }
}
