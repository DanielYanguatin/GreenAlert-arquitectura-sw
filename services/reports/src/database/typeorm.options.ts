import type { DataSourceOptions } from 'typeorm';
import { OutboxEvent } from '../outbox/outbox-event.entity';
import { Report, ReportHistory, ReportObservation } from '../reports/entities';
import { InitialReportsSchema1764000000002 } from './migrations/1764000000002-InitialReportsSchema';

export function buildDataSourceOptions(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [Report, ReportHistory, ReportObservation, OutboxEvent],
    migrations: [InitialReportsSchema1764000000002],
    migrationsRun: true,
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    logging: env.DB_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
