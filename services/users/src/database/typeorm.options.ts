import type { DataSourceOptions } from 'typeorm';
import { RevokedToken } from '../auth/revoked-token.entity';
import { User } from '../users/user.entity';
import { InitialUsersSchema1764000000001 } from './migrations/1764000000001-InitialUsersSchema';

export function buildDataSourceOptions(env: NodeJS.ProcessEnv | Record<string, string | undefined>): DataSourceOptions {
  return {
    type: 'mysql',
    host: env.DB_HOST,
    port: Number(env.DB_PORT ?? 3306),
    username: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    entities: [User, RevokedToken],
    migrations: [InitialUsersSchema1764000000001],
    migrationsRun: true,
    synchronize: false,
    timezone: 'Z',
    charset: 'utf8mb4',
    logging: env.DB_LOGGING === 'true' ? ['query', 'error'] : ['error'],
  };
}
