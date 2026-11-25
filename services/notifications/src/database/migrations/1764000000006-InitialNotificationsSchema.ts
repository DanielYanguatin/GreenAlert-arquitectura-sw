import type { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialNotificationsSchema1764000000006 implements MigrationInterface {
  name = 'InitialNotificationsSchema1764000000006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notifications (
        id CHAR(36) NOT NULL,
        recipient_user_id CHAR(36) NOT NULL,
        recipient_email VARCHAR(160) NULL,
        channel ENUM('EMAIL') NOT NULL DEFAULT 'EMAIL',
        type ENUM('REGISTRO','REPORTE_RECIBIDO','NUEVO_REPORTE','CAMBIO_ESTADO','ASIGNACION','ALERTA') NOT NULL,
        subject VARCHAR(200) NOT NULL,
        body TEXT NOT NULL,
        status ENUM('PENDING','SENT','FAILED') NOT NULL DEFAULT 'PENDING',
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME(3) NOT NULL,
        locked_by VARCHAR(64) NULL,
        locked_until DATETIME(3) NULL,
        last_error VARCHAR(500) NULL,
        is_read TINYINT(1) NOT NULL DEFAULT 0,
        sent_at DATETIME(3) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        PRIMARY KEY (id),
        KEY idx_notifications_dispatch (status, next_attempt_at),
        KEY idx_notifications_recipient (recipient_user_id, created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE notifications');
  }
}
