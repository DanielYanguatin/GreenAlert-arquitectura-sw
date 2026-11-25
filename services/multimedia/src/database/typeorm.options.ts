import type { DataSourceOptions } from 'typeorm';
import { Evidence } from '../evidences/evidence.entity';
import { InitialMultimediaSchema1764000000003 } from './migrations/1764000000003-InitialMultimediaSchema';

export function buildDataSourceOptions(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [Evidence],
    migrations: [InitialMultimediaSchema1764000000003],
    migrationsRun: true,
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    logging: env.DB_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
