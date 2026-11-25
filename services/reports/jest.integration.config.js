/** @type {import('jest').Config} */
module.exports = {
  displayName: 'reports:integration',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'test/.*\.int-spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts', '!src/database/migrations/**', '!src/database/data-source.ts', '!src/**/*.module.ts', '!src/**/dto/**'],
  coverageDirectory: 'coverage-integration',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  setupFiles: ['<rootDir>/test/env.setup.ts'],
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports/junit', outputName: 'integration.xml' }]],
};
