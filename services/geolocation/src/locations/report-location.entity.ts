import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { Municipality } from '../municipalities/municipality.entity';

const decimal = {
  to: (v: number | null | undefined): number | null | undefined => v,
  from: (v: string | null): number | null => (v === null ? null : Number(v)),
};

/**
 * Proyección geográfica de un reporte (propiedad de geolocation). Se alimenta desde reports
 * mediante el outbox; contiene solo lo necesario para mapas y consultas espaciales (sin datos del autor).
 */
@Entity({ name: 'report_locations' })
@Index('idx_locations_lat_lng', ['latitude', 'longitude'])
export class ReportLocation {
  @PrimaryColumn({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  @Column({ type: 'decimal', precision: 9, scale: 6, transformer: decimal })
  latitude: number;

  @Column({ type: 'decimal', precision: 9, scale: 6, transformer: decimal })
  longitude: number;

  @Index('idx_locations_municipality')
  @Column({ name: 'municipality_code', type: 'varchar', length: 10 })
  municipalityCode: string;

  @ManyToOne(() => Municipality)
  @JoinColumn({ name: 'municipality_code' })
  municipality?: Municipality;

  @Index('idx_locations_category')
  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Index('idx_locations_status')
  @Column({ type: 'varchar', length: 20 })
  status: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ name: 'reported_at', type: 'datetime', precision: 3 })
  reportedAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}
