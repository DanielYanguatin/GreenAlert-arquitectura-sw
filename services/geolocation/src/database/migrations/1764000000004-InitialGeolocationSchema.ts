import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Esquema inicial y carga de los 13 municipios del Putumayo (códigos DANE).
 * Solo Mocoa queda HABILITADO, con un rectángulo envolvente APROXIMADO (no es el límite oficial).
 * Los demás se cargan deshabilitados y sin geometría hasta contar con datos oficiales DANE/IGAC.
 */
export class InitialGeolocationSchema1764000000004 implements MigrationInterface {
  name = 'InitialGeolocationSchema1764000000004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE municipalities (
        code VARCHAR(10) NOT NULL,
        name VARCHAR(80) NOT NULL,
        department VARCHAR(60) NOT NULL,
        enabled TINYINT(1) NOT NULL DEFAULT 0,
        min_lat DECIMAL(9,6) NULL,
        max_lat DECIMAL(9,6) NULL,
        min_lng DECIMAL(9,6) NULL,
        max_lng DECIMAL(9,6) NULL,
        center_lat DECIMAL(9,6) NULL,
        center_lng DECIMAL(9,6) NULL,
        PRIMARY KEY (code),
        CONSTRAINT chk_muni_lat CHECK (min_lat IS NULL OR min_lat < max_lat),
        CONSTRAINT chk_muni_lng CHECK (min_lng IS NULL OR min_lng < max_lng)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      CREATE TABLE report_locations (
        report_id CHAR(36) NOT NULL,
        latitude DECIMAL(9,6) NOT NULL,
        longitude DECIMAL(9,6) NOT NULL,
        municipality_code VARCHAR(10) NOT NULL,
        category VARCHAR(40) NOT NULL,
        status VARCHAR(20) NOT NULL,
        title VARCHAR(120) NOT NULL,
        reported_at DATETIME(3) NOT NULL,
        updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
        PRIMARY KEY (report_id),
        KEY idx_locations_lat_lng (latitude, longitude),
        KEY idx_locations_municipality (municipality_code),
        KEY idx_locations_category (category),
        KEY idx_locations_status (status),
        CONSTRAINT fk_locations_municipality FOREIGN KEY (municipality_code) REFERENCES municipalities (code)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    await queryRunner.query(`
      INSERT INTO municipalities (code, name, department, enabled, min_lat, max_lat, min_lng, max_lng, center_lat, center_lng) VALUES
        ('86001', 'Mocoa', 'Putumayo', 1, 0.900000, 1.450000, -77.000000, -76.300000, 1.148000, -76.646000),
        ('86219', 'Colón', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86320', 'Orito', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86568', 'Puerto Asís', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86569', 'Puerto Caicedo', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86571', 'Puerto Guzmán', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86573', 'Puerto Leguízamo', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86749', 'Sibundoy', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86755', 'San Francisco', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86757', 'San Miguel', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86760', 'Santiago', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86865', 'Valle del Guamuez', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL),
        ('86885', 'Villagarzón', 'Putumayo', 0, NULL, NULL, NULL, NULL, NULL, NULL)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE report_locations');
    await queryRunner.query('DROP TABLE municipalities');
  }
}
