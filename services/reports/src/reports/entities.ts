import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { AiStatus, LocationStatus, ReportStatus } from './report.domain';

/** Transformador para columnas DECIMAL (mysql2 las devuelve como string). */
const decimal = {
  to: (v: number | null | undefined): number | null | undefined => v,
  from: (v: string | null): number | null => (v === null ? null : Number(v)),
};

@Entity({ name: 'reports' })
@Index('idx_reports_status_created', ['status', 'createdAt'])
export class Report {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_reports_user')
  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @Column({ type: 'varchar', length: 120 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Index('idx_reports_category')
  @Column({ type: 'varchar', length: 40 })
  category: string;

  @Column({ type: 'enum', enum: ReportStatus, default: ReportStatus.PENDIENTE })
  status: ReportStatus;

  @Column({ type: 'decimal', precision: 9, scale: 6, transformer: decimal })
  latitude: number;

  @Column({ type: 'decimal', precision: 9, scale: 6, transformer: decimal })
  longitude: number;

  @Column({ type: 'varchar', length: 200, nullable: true })
  address: string | null;

  @Index('idx_reports_municipality')
  @Column({ name: 'municipality_code', type: 'varchar', length: 10, nullable: true })
  municipalityCode: string | null;

  @Column({ name: 'municipality_name', type: 'varchar', length: 80, nullable: true })
  municipalityName: string | null;

  @Column({ name: 'location_status', type: 'enum', enum: LocationStatus, default: LocationStatus.PENDING })
  locationStatus: LocationStatus;

  @Index('idx_reports_assigned')
  @Column({ name: 'assigned_to', type: 'char', length: 36, nullable: true })
  assignedTo: string | null;

  @Column({ name: 'ai_status', type: 'enum', enum: AiStatus, default: AiStatus.NOT_REQUESTED })
  aiStatus: AiStatus;

  @Column({ name: 'ai_suggested_category', type: 'varchar', length: 40, nullable: true })
  aiSuggestedCategory: string | null;

  @Column({ name: 'ai_confidence', type: 'decimal', precision: 4, scale: 3, nullable: true, transformer: decimal })
  aiConfidence: number | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;

  @OneToMany(() => ReportHistory, (h) => h.report)
  history?: ReportHistory[];
}

@Entity({ name: 'report_history' })
export class ReportHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_history_report')
  @Column({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  @ManyToOne(() => Report, (r) => r.history, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report?: Report;

  @Column({ type: 'varchar', length: 30 })
  action: string;

  @Column({ name: 'from_value', type: 'varchar', length: 60, nullable: true })
  fromValue: string | null;

  @Column({ name: 'to_value', type: 'varchar', length: 60, nullable: true })
  toValue: string | null;

  @Column({ name: 'changed_by', type: 'varchar', length: 36 })
  changedBy: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}

@Entity({ name: 'report_observations' })
export class ReportObservation {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_observations_report')
  @Column({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  @ManyToOne(() => Report, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_id' })
  report?: Report;

  @Column({ name: 'author_id', type: 'char', length: 36 })
  authorId: string;

  @Column({ name: 'author_role', type: 'varchar', length: 20 })
  authorRole: string;

  @Column({ type: 'text' })
  text: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
