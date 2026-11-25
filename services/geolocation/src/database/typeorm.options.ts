import type { DataSourceOptions } from 'typeorm';
import { ReportLocation } from '../locations/report-location.entity';
import { Municipality } from '../municipalities/municipality.entity';
import { InitialGeolocationSchema1764000000004 } from './migrations/1764000000004-InitialGeolocationSchema';

export function buildDataSourceOptions(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [Municipality, ReportLocation],
    migrations: [InitialGeolocationSchema1764000000004],
    migrationsRun: true,
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    logging: env.DB_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
