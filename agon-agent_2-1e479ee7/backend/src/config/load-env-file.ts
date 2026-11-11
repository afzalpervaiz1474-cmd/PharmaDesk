import { existsSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Loads `backend/.env` into process.env using Node's built-in parser.
 * Variables that are already set in the environment take precedence.
 * A missing file is fine: production normally injects real variables.
 */
export function loadEnvFile(path: string = join(process.cwd(), '.env')): void {
  if (existsSync(path)) process.loadEnvFile(path);
}
