import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Se ejecuta antes de importar los módulos (ConfigModule valida el entorno al cargarse).
const STUB = `http://127.0.0.1:${process.env.STUB_PORT ?? '47003'}`;

Object.assign(process.env, {
  DB_HOST: process.env.TEST_DB_HOST ?? '127.0.0.1',
  DB_PORT: process.env.TEST_DB_PORT ?? '3307',
  DB_USER: 'root',
  DB_PASSWORD: process.env.TEST_DB_ROOT_PASSWORD ?? 'test-root-password',
  DB_NAME: 'greenalert_multimedia_test',
  INTERNAL_API_KEY: 'integration-internal-key-0123456789',
  HTTP_TIMEOUT_MS: '1000',
  // La dependencia (reports) apunta a un servidor HTTP simulado (test/stub-server.ts).
  REPORTS_SERVICE_URL: STUB,
  UPLOAD_DIR: join(tmpdir(), 'greenalert-multimedia-test'),
  MAX_FILE_SIZE_MB: '1',
  MAX_FILES_PER_REPORT: '3',
});
