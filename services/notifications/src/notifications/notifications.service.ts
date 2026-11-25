import {
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnApplicationShutdown,
  type OnModuleInit,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { FindOptionsWhere, Repository } from 'typeorm';
import { NOTIFICATION_CHANNEL, type NotificationChannel } from '../channels/channels';
import { USERS_CLIENT, type UsersPort } from '../clients/users.client';
import { UpstreamError } from '../common/http-client';
import type { CreateNotificationDto, ListNotificationsQueryDto } from './dto/notifications.dto';
import { Notification, NotificationStatus } from './notification.entity';
import { render } from './templates';

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
}

const LOCK_MS = 60_000;

export function backoffDelay(attempts: number): number {
  return Math.min(10_000 * 2 ** Math.max(attempts - 1, 0), 30 * 60_000);
}

@Injectable()
export class NotificationsService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly instanceId = `${hostname()}-${randomUUID().slice(0, 8)}`;
  private readonly maxAttempts: number;
  private readonly intervalMs: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(Notification) private readonly notifications: Repository<Notification>,
    @Inject(USERS_CLIENT) private readonly users: UsersPort,
    @Inject(NOTIFICATION_CHANNEL) private readonly channel: NotificationChannel,
    config: ConfigService,
  ) {
    this.maxAttempts = Number(config.get('NOTIFICATIONS_MAX_ATTEMPTS') ?? 6);
    this.intervalMs = Number(config.get('NOTIFICATIONS_INTERVAL_MS') ?? 5000);
  }

  onModuleInit(): void {
    if (this.intervalMs <= 0) return;
    this.timer = setInterval(() => void this.dispatchSafely(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /**
   * Acepta una solicitud de notificación y la encola (202). El envío real es asíncrono, así quien la
   * solicita (users, reports) nunca espera al proveedor de correo.
   */
  async accept(dto: CreateNotificationDto): Promise<{ accepted: number; ids: string[] }> {
    const message = render(dto.type, dto.data);
    let recipients: { id: string; email: string | null }[];
    if (dto.recipientRoles?.length) {
      try {
        const users = await this.users.findByRoles(dto.recipientRoles);
        recipients = users.filter((u) => u.active).map((u) => ({ id: u.id, email: u.email }));
      } catch (e) {
        // Sin la lista de destinatarios no se puede encolar; el emisor (outbox de reports) reintentará.
        throw new ServiceUnavailableException(`No se pudo resolver destinatarios: ${(e as Error).message}`);
      }
    } else {
      recipients = [{ id: dto.recipientUserId!, email: dto.recipientEmail ?? null }];
    }
    if (recipients.length === 0) return { accepted: 0, ids: [] };

    const saved = await this.notifications.save(
      recipients.map((r) =>
        this.notifications.create({
          recipientUserId: r.id,
          recipientEmail: r.email,
          type: dto.type,
          subject: message.subject,
          body: message.body,
          status: NotificationStatus.PENDING,
          attempts: 0,
          nextAttemptAt: new Date(),
        }),
      ),
    );
    return { accepted: saved.length, ids: saved.map((n) => n.id) };
  }

  private async dispatchSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchPending();
    } catch (e) {
      this.logger.error(`Fallo del despachador de notificaciones: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /** Reclama un lote (seguro con varias réplicas) y lo envía con reintentos y retroceso exponencial. */
  async dispatchPending(batchSize = 20): Promise<DispatchResult> {
    const now = new Date();
    await this.notifications
      .createQueryBuilder()
      .update(Notification)
      .set({ lockedBy: this.instanceId, lockedUntil: new Date(now.getTime() + LOCK_MS) })
      .where('status = :status', { status: NotificationStatus.PENDING })
      .andWhere('next_attempt_at <= :now', { now })
      .andWhere('(locked_until IS NULL OR locked_until < :now)', { now })
      .orderBy('created_at', 'ASC')
      .limit(batchSize)
      .execute();

    const claimed = await this.notifications.find({
      where: { lockedBy: this.instanceId, status: NotificationStatus.PENDING } as FindOptionsWhere<Notification>,
      order: { createdAt: 'ASC' },
      take: batchSize,
    });

    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };
    for (const n of claimed) result[await this.deliver(n)] += 1;
    return result;
  }

  private async deliver(n: Notification): Promise<keyof DispatchResult> {
    try {
      const email = n.recipientEmail ?? (await this.users.findById(n.recipientUserId)).email;
      await this.channel.send({ to: email, subject: n.subject, body: n.body });
      await this.notifications.update(n.id, {
        status: NotificationStatus.SENT,
        recipientEmail: email,
        attempts: n.attempts + 1,
        sentAt: new Date(),
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
      });
      return 'sent';
    } catch (e) {
      const attempts = n.attempts + 1;
      // Un destinatario inexistente (404) no se arregla reintentando.
      const permanent = e instanceof UpstreamError && e.status === 404;
      const failed = permanent || attempts >= this.maxAttempts;
      await this.notifications.update(n.id, {
        status: failed ? NotificationStatus.FAILED : NotificationStatus.PENDING,
        attempts,
        nextAttemptAt: new Date(Date.now() + backoffDelay(attempts)),
        lockedBy: null,
        lockedUntil: null,
        lastError: (e as Error).message.slice(0, 500),
      });
      this.logger.warn(`Notificación ${n.id} intento ${attempts} falló: ${(e as Error).message}`);
      return failed ? 'failed' : 'retried';
    }
  }

  async listForUser(userId: string, query: ListNotificationsQueryDto): Promise<Page<Notification>> {
    return this.page({ recipientUserId: userId, ...(query.status ? { status: query.status } : {}) }, query);
  }

  async listAll(query: ListNotificationsQueryDto): Promise<Page<Notification>> {
    return this.page(query.status ? { status: query.status } : {}, query);
  }

  private async page(
    where: FindOptionsWhere<Notification>,
    query: ListNotificationsQueryDto,
  ): Promise<Page<Notification>> {
    const [items, total] = await this.notifications.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return { items, total, page: query.page, limit: query.limit };
  }

  async markRead(userId: string, id: string): Promise<void> {
    const result = await this.notifications.update({ id, recipientUserId: userId }, { read: true });
    if (!result.affected) throw new NotFoundException('Notificación no encontrada');
  }

  async stats(): Promise<Record<NotificationStatus, number>> {
    const base: Record<NotificationStatus, number> = { PENDING: 0, SENT: 0, FAILED: 0 };
    for (const status of Object.values(NotificationStatus)) {
      base[status] = await this.notifications.count({ where: { status } });
    }
    return base;
  }
}
