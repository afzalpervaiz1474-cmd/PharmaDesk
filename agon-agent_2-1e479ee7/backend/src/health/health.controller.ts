import { Controller, Get, Inject } from '@nestjs/common';
import { APP_VERSION } from '../app.setup';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { Database } from '../database/database';

export interface HealthResponse {
  status: 'ok' | 'degraded';
  version: string;
  database: 'up' | 'down';
  aiGateway: 'configured' | 'not_configured';
  time: string;
}

@Controller('health')
export class HealthController {
  constructor(
    private readonly database: Database,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Public. Reports whether the server and its database are reachable. */
  @Get()
  async check(): Promise<HealthResponse> {
    let database: HealthResponse['database'] = 'up';
    try {
      await this.database.query('SELECT 1');
    } catch {
      database = 'down';
    }
    return {
      status: database === 'up' ? 'ok' : 'degraded',
      version: APP_VERSION,
      database,
      // "configured" means a key is set; it does not prove the gateway is reachable.
      aiGateway: this.config.omniroute ? 'configured' : 'not_configured',
      time: new Date().toISOString(),
    };
  }
}
