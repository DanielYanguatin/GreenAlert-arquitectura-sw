import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum OutboxStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum OutboxType {
  /** Registrar/actualizar la proyección geográfica del reporte en geolocation. */
  LOCATION_UPSERT = 'LOCATION_UPSERT',
  /** Solicitar una notificación a notifications. */
  NOTIFY = 'NOTIFY',
}

/**
 * Transactional Outbox: los eventos se guardan en la misma transacción que el cambio de negocio
 * y un despachador los entrega con reintentos. Así una caída de geolocation o notifications
 * nunca impide registrar o actualizar un reporte, y ningún evento se pierde.
 */
@Entity({ name: 'outbox_events' })
@Index('idx_outbox_dispatch', ['status', 'nextAttemptAt'])
export class OutboxEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 30 })
  type: OutboxType;

  @Column({ name: 'aggregate_id', type: 'char', length: 36 })
  aggregateId: string;

  @Column({ type: 'json' })
  payload: Record<string, unknown>;

  @Column({ type: 'enum', enum: OutboxStatus, default: OutboxStatus.PENDING })
  status: OutboxStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', precision: 3 })
  nextAttemptAt: Date;

  @Column({ name: 'locked_by', type: 'varchar', length: 64, nullable: true })
  lockedBy: string | null;

  @Column({ name: 'locked_until', type: 'datetime', precision: 3, nullable: true })
  lockedUntil: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @Column({ name: 'sent_at', type: 'datetime', precision: 3, nullable: true })
  sentAt: Date | null;
}
