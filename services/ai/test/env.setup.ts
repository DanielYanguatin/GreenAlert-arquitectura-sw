// Se ejecuta antes de importar los módulos (ConfigModule valida el entorno al cargarse).
Object.assign(process.env, {
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT ?? '3307',
  DB_USER: 'root',
  DB_PASSWORD: process.env.TEST_DB_ROOT_PASSWORD ?? 'test-root-password',
  DB_NAME: 'greenalert_ai_test',
  INTERNAL_API_KEY: 'integration-internal-key-0123456789',
  HTTP_TIMEOUT_MS: '1000',
  AI_PROVIDER: 'heuristic',
});
