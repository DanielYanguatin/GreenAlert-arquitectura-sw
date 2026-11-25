import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialReportsSchema1764000000002 implements MigrationInterface {
  name = 'InitialReportsSchema1764000000002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE reports (
        id CHAR(36) NOT NULL,
        user_id CHAR(36) NOT NULL,
        title VARCHAR(120) NOT NULL,
        description TEXT NOT NULL,
        category VARCHAR(40) NOT NULL,
        status ENUM('PENDIENTE','EN_REVISION','EN_PROCESO','RESUELTO','RECHAZADO') NOT NULL DEFAULT 'PENDIENTE',
        latitude DECIMAL(9,6) NOT NULL,
        longitude DECIMAL(9,6) NOT NULL,
        address VARCHAR(200) NULL,
        municipality_code VARCHAR(10) NULL,
        municipality_name VARCHAR(80) NULL,
        location_status ENUM('VALIDATED','PENDING','OUT_OF_COVERAGE') NOT NULL DEFAULT 'PENDING',
        assigned_to CHAR(36) NULL,
        ai_status ENUM('NOT_REQUESTED','COMPLETED','UNAVAILABLE') NOT NULL DEFAULT 'NOT_REQUESTED',
        ai_suggested_category VARCHAR(40) NULL,
        ai_confidence DECIMAL(4,3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_reports_user (user_id),
        KEY idx_reports_category (category),
        KEY idx_reports_municipality (municipality_code),
        KEY idx_reports_assigned (assigned_to),
        KEY idx_reports_status_created (status, created_at),
        CONSTRAINT chk_reports_lat CHECK (latitude BETWEEN -90 AND 90),
        CONSTRAINT chk_reports_lng CHECK (longitude BETWEEN -180 AND 180),
        CONSTRAINT chk_reports_conf CHECK (ai_confidence IS NULL OR (ai_confidence BETWEEN 0 AND 1))
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE report_history (
        id CHAR(36) NOT NULL,
        report_id CHAR(36) NOT NULL,
        action VARCHAR(30) NOT NULL,
        from_value VARCHAR(60) NULL,
        to_value VARCHAR(60) NULL,
        changed_by VARCHAR(36) NOT NULL,
        comment VARCHAR(500) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_history_report (report_id),
        CONSTRAINT fk_history_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE report_observations (
        id CHAR(36) NOT NULL,
        report_id CHAR(36) NOT NULL,
        author_id CHAR(36) NOT NULL,
        author_role VARCHAR(20) NOT NULL,
        text TEXT NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_observations_report (report_id),
        CONSTRAINT fk_observations_report FOREIGN KEY (report_id) REFERENCES reports (id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE outbox_events (
        id CHAR(36) NOT NULL,
        type VARCHAR(30) NOT NULL,
        aggregate_id CHAR(36) NOT NULL,
        payload JSON NOT NULL,
        status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME(3) NOT NULL,
        locked_by VARCHAR(64) NULL,
        locked_until DATETIME(3) NULL,
        last_error VARCHAR(500) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        sent_at DATETIME(3) NULL,
        PRIMARY KEY (id),
        KEY idx_outbox_dispatch (status, next_attempt_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE outbox_events');
    await queryRunner.query('DROP TABLE report_observations');
    await queryRunner.query('DROP TABLE report_history');
    await queryRunner.query('DROP TABLE reports');
  }
}
