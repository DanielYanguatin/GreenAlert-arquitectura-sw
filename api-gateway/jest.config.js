// Umbral de cobertura configurable (ver docs/12-informe-calidad-codigo.md §5): no se fija el 85 % hasta confirmar su significado.
const threshold = Number(process.env.COVERAGE_THRESHOLD ?? 0);

/** @type {import('jest').Config} */
module.exports = {
  displayName: 'gateway:unit',
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: 'src/.*\.spec\.ts$',
  transform: { '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }] },
  testEnvironment: 'node',
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/database/migrations/**', '!src/database/data-source.ts', '!src/**/*.module.ts', '!src/**/dto/**'],
  coverageDirectory: 'coverage',
  coverageReporters: ['text-summary', 'lcov', 'json-summary'],
  coverageThreshold: { global: { lines: threshold, statements: threshold, branches: threshold, functions: threshold } },
  reporters: ['default', ['jest-junit', { outputDirectory: 'reports/junit', outputName: 'unit.xml' }]],
};
