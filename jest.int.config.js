// Integration tests: real Postgres (local "vault_test" schema), run one file at a time.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/test-int'],
  testMatch: ['**/*.int-spec.ts'],
  setupFiles: ['<rootDir>/test-int/setup-env.ts'],
  globalSetup: '<rootDir>/test-int/global-setup.ts',
  maxWorkers: 1,
  testTimeout: 30000,
};
