import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import type { Request, Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();

    const isHttp = exception instanceof HttpException;
    const status = isHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttp
      ? (exception.getResponse() as string | { message: string })
      : exception instanceof Error
        ? exception.message
        : "Internal server error";

    const body =
      typeof message === "string"
        ? message
        : extractHttpMessage(message);

    if (isHttp && status < 500) {
      this.logger.warn(`${req.method} ${req.url} ${status} — ${body}`);
    } else {
      const stack =
        exception instanceof Error ? exception.stack : String(exception);
      this.logger.error(`${req.method} ${req.url} ${status} — ${body}`, stack);
    }

    res.status(status).json({
      statusCode: status,
      message: body,
      path: req.url,
      method: req.method,
      timestamp: new Date().toISOString(),
    });
  }
}

function extractHttpMessage(
  message: { message?: unknown; error?: unknown },
): string {
  if (typeof message.message === "string") {
    return message.message;
  }

  if (Array.isArray(message.message) && message.message.length > 0) {
    return String(message.message[0]);
  }

  if (message.error && typeof message.error === "object") {
    const nested = message.error as { message?: unknown };
    if (typeof nested.message === "string") {
      return nested.message;
    }
  }

  return "Internal server error";
}
