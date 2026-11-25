// Se ejecuta antes de importar los módulos (ConfigModule valida el entorno al cargarse).
const STUB = `http://127.0.0.1:${process.env.STUB_PORT ?? '47006'}`;

Object.assign(process.env, {
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT ?? '3307',
  DB_USER: 'root',
  DB_PASSWORD: process.env.TEST_DB_ROOT_PASSWORD ?? 'test-root-password',
  DB_NAME: 'greenalert_notifications_test',
  INTERNAL_API_KEY: 'integration-internal-key-0123456789',
  HTTP_TIMEOUT_MS: '1000',
  USERS_SERVICE_URL: STUB,
  EMAIL_TRANSPORT: 'memory',
  NOTIFICATIONS_INTERVAL_MS: '0',
  NOTIFICATIONS_MAX_ATTEMPTS: '3',
});
