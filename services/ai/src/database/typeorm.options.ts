import type { DataSourceOptions } from 'typeorm';
import { Classification } from '../classification/classification.entity';
import { InitialAiSchema1764000000005 } from './migrations/1764000000005-InitialAiSchema';

export function buildDataSourceOptions(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [Classification],
    migrations: [InitialAiSchema1764000000005],
    migrationsRun: true,
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    logging: env.DB_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
