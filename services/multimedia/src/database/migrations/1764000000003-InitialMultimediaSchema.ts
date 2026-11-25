import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialMultimediaSchema1764000000003 implements MigrationInterface {
  name = 'InitialMultimediaSchema1764000000003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE evidences (
        id CHAR(36) NOT NULL,
        report_id CHAR(36) NOT NULL,
        uploader_id CHAR(36) NOT NULL,
        original_name VARCHAR(150) NOT NULL,
        stored_name VARCHAR(60) NOT NULL,
        mime_type VARCHAR(30) NOT NULL,
        size_bytes INT UNSIGNED NOT NULL,
        sha256 CHAR(64) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        UNIQUE KEY uq_evidences_stored_name (stored_name),
        KEY idx_evidences_report (report_id),
        CONSTRAINT chk_evidences_mime CHECK (mime_type IN ('image/jpeg','image/png','image/webp')),
        CONSTRAINT chk_evidences_size CHECK (size_bytes > 0)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE evidences');
  }
}
