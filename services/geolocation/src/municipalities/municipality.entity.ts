import { Column, Entity, PrimaryColumn } from 'typeorm';

const decimal = {
  to: (v: number | null | undefined): number | null | undefined => v,
  from: (v: string | null): number | null => (v === null ? null : Number(v)),
};

/**
 * Municipio y su cobertura. La geometría es un rectángulo envolvente (bounding box) APROXIMADO.
 * Debe reemplazarse por la geometría oficial (DANE/IGAC) antes de un uso institucional (ver TD-06).
 */
@Entity({ name: 'municipalities' })
export class Municipality {
  @PrimaryColumn({ type: 'varchar', length: 10 })
  code: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ type: 'varchar', length: 60 })
  department: string;

  @Column({ type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'min_lat', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  minLat: number | null;

  @Column({ name: 'max_lat', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  maxLat: number | null;

  @Column({ name: 'min_lng', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  minLng: number | null;

  @Column({ name: 'max_lng', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  maxLng: number | null;

  @Column({ name: 'center_lat', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  centerLat: number | null;

  @Column({ name: 'center_lng', type: 'decimal', precision: 9, scale: 6, nullable: true, transformer: decimal })
  centerLng: number | null;
}

export function hasBounds(
  m: Municipality,
): m is Municipality & { minLat: number; maxLat: number; minLng: number; maxLng: number } {
  return m.minLat !== null && m.maxLat !== null && m.minLng !== null && m.maxLng !== null;
}
