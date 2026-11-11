import { loadConfig } from '../config/app-config';
import { loadEnvFile } from '../config/load-env-file';
import { runMigrations } from './migration-runner';
import { PgDatabase } from './pg-database';

/** CLI entry point: `npm run migrate`. */
async function main(): Promise<void> {
  loadEnvFile();
  const config = loadConfig(process.env);
  const database = new PgDatabase({ connectionString: config.databaseUrl, ssl: config.databaseSsl });
  try {
    const ran = await runMigrations(database);
    console.log(ran.length === 0 ? 'Database is up to date.' : `Applied ${ran.length} migration(s):\n  ${ran.join('\n  ')}`);
  } finally {
    await database.close();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
