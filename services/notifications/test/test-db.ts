import { createConnection } from 'mysql2/promise';

/**
 * Prepara una base de datos MySQL **real** y vacía para las pruebas de integración.
 * Variables: TEST_DB_HOST, TEST_DB_PORT, TEST_DB_ROOT_PASSWORD (por defecto: entorno local de pruebas).
 */
export async function resetTestDatabase(name: string): Promise<void> {
  const host = process.env.TEST_DB_HOST ?? '127.0.0.1';
  const port = Number(process.env.TEST_DB_PORT ?? 3307);
  const password = process.env.TEST_DB_ROOT_PASSWORD ?? 'test-root-password';
  const conn = await createConnection({ host, port, user: 'root', password });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${name}\``);
    await conn.query(`CREATE DATABASE \`${name}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  } finally {
    await conn.end();
  }
}
