import { Catch, HttpException, HttpStatus, Logger, type ArgumentsHost, type ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string;
  /** Individual validation messages, when there are several. */
  details?: string[];
}

/**
 * One response shape for every error.
 * Expected errors (HttpException) pass their message through. Anything else
 * is logged in full on the server and reported to the client as a generic
 * 500, so stack traces, SQL and secrets never leave the process.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const rawMessage = typeof payload === 'string' ? payload : (payload as { message?: unknown }).message;
      const details = Array.isArray(rawMessage) ? rawMessage.map(String) : undefined;
      const body: ErrorBody = {
        statusCode: status,
        error: HttpStatus[status] ?? 'ERROR',
        message: details ? details.join('; ') : typeof rawMessage === 'string' ? rawMessage : exception.message,
        ...(details && details.length > 1 ? { details } : {}),
      };
      response.status(status).json(body);
      return;
    }

    this.logger.error(exception instanceof Error ? (exception.stack ?? exception.message) : String(exception));
    const body: ErrorBody = {
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'INTERNAL_SERVER_ERROR',
      message: 'Unexpected server error',
    };
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json(body);
  }
}
