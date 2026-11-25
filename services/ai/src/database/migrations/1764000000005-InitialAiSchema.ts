import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialAiSchema1764000000005 implements MigrationInterface {
  name = 'InitialAiSchema1764000000005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE classifications (
        id CHAR(36) NOT NULL,
        report_id CHAR(36) NOT NULL,
        evidence_ids JSON NOT NULL,
        suggested_category VARCHAR(40) NOT NULL,
        confidence DECIMAL(4,3) NOT NULL,
        scores JSON NOT NULL,
        provider VARCHAR(40) NOT NULL,
        model_version VARCHAR(60) NOT NULL,
        requires_review TINYINT(1) NOT NULL DEFAULT 1,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_classifications_report (report_id),
        CONSTRAINT chk_classifications_conf CHECK (confidence BETWEEN 0 AND 1)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE classifications');
  }
}
