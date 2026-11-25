import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

const decimal = {
  to: (v: number | null | undefined): number | null | undefined => v,
  from: (v: string | null): number | null => (v === null ? null : Number(v)),
};

/** Registro auditable de cada clasificación sugerida. */
@Entity({ name: 'classifications' })
export class Classification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_classifications_report')
  @Column({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  @Column({ name: 'evidence_ids', type: 'json' })
  evidenceIds: string[];

  @Column({ name: 'suggested_category', type: 'varchar', length: 40 })
  suggestedCategory: string;

  @Column({ type: 'decimal', precision: 4, scale: 3, transformer: decimal })
  confidence: number;

  @Column({ type: 'json' })
  scores: Record<string, number>;

  @Column({ type: 'varchar', length: 40 })
  provider: string;

  @Column({ name: 'model_version', type: 'varchar', length: 60 })
  modelVersion: string;

  @Column({ name: 'requires_review', type: 'boolean', default: true })
  requiresReview: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
