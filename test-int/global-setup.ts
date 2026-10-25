import { execSync } from 'node:child_process';
import { testDatabaseUrl } from './setup-env';

/** Applies all migrations to the vault_test schema before the integration tests run. */
export default async function globalSetup() {
  execSync('npx prisma migrate deploy', { env: { ...process.env, DATABASE_URL: testDatabaseUrl() }, stdio: 'pipe' });
}
