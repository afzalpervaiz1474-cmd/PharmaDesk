import { Global, Injectable, Module, type OnApplicationShutdown } from '@nestjs/common';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { Database } from './database';
import { PgDatabase } from './pg-database';

/** Closes the connection pool when the application stops. */
@Injectable()
class DatabaseLifecycle implements OnApplicationShutdown {
  constructor(private readonly database: Database) {}

  async onApplicationShutdown(): Promise<void> {
    await this.database.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: Database,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig): Database =>
        new PgDatabase({ connectionString: config.databaseUrl, ssl: config.databaseSsl }),
    },
    DatabaseLifecycle,
  ],
  exports: [Database],
})
export class DatabaseModule {}
