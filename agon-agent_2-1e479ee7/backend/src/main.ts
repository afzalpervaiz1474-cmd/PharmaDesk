import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { API_PREFIX, configureApp } from './app.setup';
import { APP_CONFIG, ConfigError, loadConfig, type AppConfig } from './config/app-config';
import { loadEnvFile } from './config/load-env-file';

async function bootstrap(): Promise<void> {
  loadEnvFile();
  // Check the configuration before Nest starts, so a mistake in .env is reported
  // as a short list of problems instead of a dependency-injection stack trace.
  try {
    loadConfig(process.env);
  } catch (error) {
    if (!(error instanceof ConfigError)) throw error;
    console.error(error.message);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule);
  const config = app.get<AppConfig>(APP_CONFIG);
  configureApp(app, config);
  await app.listen(config.port);

  const logger = new Logger('Bootstrap');
  logger.log(`PharmaDesk backend listening on http://localhost:${config.port}/${API_PREFIX}`);
  logger.log(
    config.omniroute
      ? `AI assistant: OmniRoute gateway configured (model "${config.omniroute.model}")`
      : 'AI assistant: no gateway key set - running in data-lookup mode',
  );
}

bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
