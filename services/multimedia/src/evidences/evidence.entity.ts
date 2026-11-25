import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'evidences' })
export class Evidence {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_evidences_report')
  @Column({ name: 'report_id', type: 'char', length: 36 })
  reportId: string;

  @Column({ name: 'uploader_id', type: 'char', length: 36 })
  uploaderId: string;

  @Column({ name: 'original_name', type: 'varchar', length: 150 })
  originalName: string;

  @Column({ name: 'stored_name', type: 'varchar', length: 60, unique: true, select: false })
  storedName: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 30 })
  mimeType: string;

  @Column({ name: 'size_bytes', type: 'int', unsigned: true })
  sizeBytes: number;

  @Column({ type: 'char', length: 64 })
  sha256: string;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
