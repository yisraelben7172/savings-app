// Points every integration test at a separate "vault_test" schema in the local database (never "public").
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export function testDatabaseUrl() {
  const fromEnv = process.env.TEST_DATABASE_URL;
  if (fromEnv) return fromEnv;
  const env = readFileSync(join(__dirname, '..', '.env'), 'utf8');
  const base = env.match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  if (!base) throw new Error('DATABASE_URL not found in .env');
  const url = new URL(base);
  url.searchParams.set('schema', 'vault_test');
  return url.toString();
}

process.env.DATABASE_URL = testDatabaseUrl();
if (!process.env.DATABASE_URL.includes('schema=vault_test')) throw new Error('Refusing to run integration tests outside the vault_test schema');
