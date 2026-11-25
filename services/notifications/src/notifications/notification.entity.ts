import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum NotificationType {
  REGISTRO = 'REGISTRO',
  REPORTE_RECIBIDO = 'REPORTE_RECIBIDO',
  NUEVO_REPORTE = 'NUEVO_REPORTE',
  CAMBIO_ESTADO = 'CAMBIO_ESTADO',
  ASIGNACION = 'ASIGNACION',
  ALERTA = 'ALERTA',
}

export enum NotificationStatus {
  PENDING = 'PENDING',
  SENT = 'SENT',
  FAILED = 'FAILED',
}

export enum Channel {
  EMAIL = 'EMAIL',
}

/** Cola persistente + historial: cada fila es una notificación con su estado de entrega. */
@Entity({ name: 'notifications' })
@Index('idx_notifications_dispatch', ['status', 'nextAttemptAt'])
@Index('idx_notifications_recipient', ['recipientUserId', 'createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'recipient_user_id', type: 'char', length: 36 })
  recipientUserId: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 160, nullable: true })
  recipientEmail: string | null;

  @Column({ type: 'enum', enum: Channel, default: Channel.EMAIL })
  channel: Channel;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'varchar', length: 200 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: NotificationStatus, default: NotificationStatus.PENDING })
  status: NotificationStatus;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ name: 'next_attempt_at', type: 'datetime', precision: 3 })
  nextAttemptAt: Date;

  @Column({ name: 'locked_by', type: 'varchar', length: 64, nullable: true, select: false })
  lockedBy: string | null;

  @Column({ name: 'locked_until', type: 'datetime', precision: 3, nullable: true, select: false })
  lockedUntil: Date | null;

  @Column({ name: 'last_error', type: 'varchar', length: 500, nullable: true })
  lastError: string | null;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  read: boolean;

  @Column({ name: 'sent_at', type: 'datetime', precision: 3, nullable: true })
  sentAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;
}
