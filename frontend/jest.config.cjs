// Umbral de cobertura configurable (ver docs/12-informe-calidad-codigo.md §5).
const threshold = Number(process.env.COVERAGE_THRESHOLD ?? 0);

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'frontend:unit',
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testRegex: '\.spec\.tsx?$',
  transform: { '^.+\.tsx?$': ['ts-jest', { tsconfig: { jsx: 'react-jsx', module: 'commonjs', esModuleInterop: true, isolatedModules: true } }] },
  moduleNameMapper: {
    '\.(css)$': 'identity-obj-proxy',
    '^(\.{1,2}/)*env$': '<rootDir>/test/env.mock.ts',
  },
  setupFiles: ['<rootDir>/test/polyfills.ts'],
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', '!src/main.tsx', '!src/env.ts'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: { global: { lines: threshold, statements: threshold, branches: threshold, functions: threshold } },
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports/junit', outputName: 'unit.xml' }]],
};
