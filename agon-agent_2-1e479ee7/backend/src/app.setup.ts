import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { AllExceptionsFilter } from './common/all-exceptions.filter';
import type { AppConfig } from './config/app-config';

export const API_PREFIX = 'api/v1';
export const APP_VERSION = '0.1.0';

/**
 * Global HTTP behaviour. Shared by `main.ts` and the end-to-end tests so the
 * tests exercise the same pipeline as production.
 */
export function configureApp(app: INestApplication, config: AppConfig): void {
  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that are not declared on the DTO
      forbidNonWhitelisted: true, // …and reject the request if any were sent
      transform: true,
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.enableCors({
    origin: config.corsOrigins,
    methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.enableShutdownHooks();
}
