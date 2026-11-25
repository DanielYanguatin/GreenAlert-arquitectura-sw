import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialUsersSchema1764000000001 implements MigrationInterface {
  name = 'InitialUsersSchema1764000000001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE users (
        id CHAR(36) NOT NULL,
        email VARCHAR(160) NOT NULL,
        password_hash VARCHAR(100) NOT NULL,
        full_name VARCHAR(120) NOT NULL,
        phone VARCHAR(20) NULL,
        role ENUM('ADMIN','CIUDADANO','FUNCIONARIO','GESTOR_AMBIENTAL') NOT NULL DEFAULT 'CIUDADANO',
        entity VARCHAR(80) NULL,
        active TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_users_email (email),
        KEY idx_users_role (role)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE revoked_tokens (
        jti CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        expires_at DATETIME(3) NOT NULL,
        revoked_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (jti),
        KEY idx_revoked_expires (expires_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE revoked_tokens');
    await queryRunner.query('DROP TABLE users');
  }
}
