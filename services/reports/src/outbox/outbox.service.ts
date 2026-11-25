import { Inject, Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { hostname } from 'node:os';
import type { EntityManager, Repository } from 'typeorm';
import {
  GEOLOCATION_CLIENT,
  type GeolocationPort,
  type LocationProjection,
  NOTIFICATIONS_CLIENT,
  type NotificationRequest,
  type NotificationsPort,
} from '../clients/clients';
import { UpstreamError } from '../common/http-client';
import { Report } from '../reports/entities';
import { LocationStatus } from '../reports/report.domain';
import { OutboxEvent, OutboxStatus, OutboxType } from './outbox-event.entity';

export interface DispatchResult {
  sent: number;
  retried: number;
  failed: number;
}

const BASE_DELAY_MS = 5_000;
const MAX_DELAY_MS = 10 * 60_000;
const LOCK_MS = 60_000;

/** Retroceso exponencial: 5 s, 10 s, 20 s… hasta 10 min. */
export function backoffDelay(attempts: number): number {
  return Math.min(BASE_DELAY_MS * 2 ** Math.max(attempts - 1, 0), MAX_DELAY_MS);
}

@Injectable()
export class OutboxService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(OutboxService.name);
  private readonly instanceId = `${hostname()}-${randomUUID().slice(0, 8)}`;
  private readonly maxAttempts: number;
  private readonly intervalMs: number;
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(
    @InjectRepository(OutboxEvent) private readonly events: Repository<OutboxEvent>,
    @InjectRepository(Report) private readonly reports: Repository<Report>,
    @Inject(GEOLOCATION_CLIENT) private readonly geolocation: GeolocationPort,
    @Inject(NOTIFICATIONS_CLIENT) private readonly notifications: NotificationsPort,
    config: ConfigService,
  ) {
    this.maxAttempts = Number(config.get('OUTBOX_MAX_ATTEMPTS') ?? 10);
    this.intervalMs = Number(config.get('OUTBOX_INTERVAL_MS') ?? 5000);
  }

  onModuleInit(): void {
    if (this.intervalMs <= 0) return; // desactivado (p. ej. en pruebas que despachan manualmente)
    this.timer = setInterval(() => void this.dispatchSafely(), this.intervalMs);
    this.timer.unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  /** Registra un evento dentro de la transacción del cambio de negocio. */
  async enqueue(manager: EntityManager, type: OutboxType, aggregateId: string, payload: object): Promise<void> {
    const repo = manager.getRepository(OutboxEvent);
    await repo.save(
      repo.create({
        type,
        aggregateId,
        payload: payload as Record<string, unknown>,
        status: OutboxStatus.PENDING,
        attempts: 0,
        nextAttemptAt: new Date(),
      }),
    );
  }

  private async dispatchSafely(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.dispatchPending();
    } catch (e) {
      this.logger.error(`Fallo del despachador: ${(e as Error).message}`);
    } finally {
      this.running = false;
    }
  }

  /**
   * Reclama un lote de eventos de forma atómica (UPDATE … LIMIT con marca de bloqueo), de modo que
   * varias réplicas del servicio no entreguen el mismo evento a la vez, y luego los entrega.
   */
  async dispatchPending(batchSize = 20): Promise<DispatchResult> {
    const now = new Date();
    await this.events
      .createQueryBuilder()
      .update(OutboxEvent)
      .set({ lockedBy: this.instanceId, lockedUntil: new Date(now.getTime() + LOCK_MS) })
      .where('status = :status', { status: OutboxStatus.PENDING })
      .andWhere('next_attempt_at <= :now', { now })
      .andWhere('(locked_until IS NULL OR locked_until < :now)', { now })
      .orderBy('created_at', 'ASC')
      .limit(batchSize)
      .execute();

    const claimed = await this.events.find({
      where: { lockedBy: this.instanceId, status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
      take: batchSize,
    });

    const result: DispatchResult = { sent: 0, retried: 0, failed: 0 };
    for (const event of claimed) {
      const outcome = await this.deliver(event);
      result[outcome] += 1;
    }
    return result;
  }

  private async deliver(event: OutboxEvent): Promise<keyof DispatchResult> {
    try {
      await this.handle(event);
      await this.events.update(event.id, {
        status: OutboxStatus.SENT,
        sentAt: new Date(),
        attempts: event.attempts + 1,
        lockedBy: null,
        lockedUntil: null,
        lastError: null,
      });
      return 'sent';
    } catch (e) {
      const attempts = event.attempts + 1;
      const retryable = !(e instanceof UpstreamError) || e.unavailable;
      const exhausted = attempts >= this.maxAttempts;
      const message = (e as Error).message.slice(0, 500);
      if (!retryable && event.type === OutboxType.LOCATION_UPSERT) {
        // geolocation rechazó la ubicación (fuera de cobertura) al validarla de forma diferida.
        await this.reports.update(event.aggregateId, { locationStatus: LocationStatus.OUT_OF_COVERAGE });
      }
      const failed = !retryable || exhausted;
      await this.events.update(event.id, {
        status: failed ? OutboxStatus.FAILED : OutboxStatus.PENDING,
        attempts,
        nextAttemptAt: new Date(Date.now() + backoffDelay(attempts)),
        lockedBy: null,
        lockedUntil: null,
        lastError: message,
      });
      this.logger.warn(`Evento ${event.type} ${event.id} intento ${attempts}: ${message}`);
      return failed ? 'failed' : 'retried';
    }
  }

  private async handle(event: OutboxEvent): Promise<void> {
    switch (event.type) {
      case OutboxType.LOCATION_UPSERT: {
        const resolved = await this.geolocation.upsert(
          event.aggregateId,
          event.payload as unknown as LocationProjection,
        );
        await this.reports.update(
          { id: event.aggregateId },
          {
            locationStatus: LocationStatus.VALIDATED,
            municipalityCode: resolved.municipalityCode,
            municipalityName: resolved.municipalityName,
          },
        );
        return;
      }
      case OutboxType.NOTIFY:
        await this.notifications.send(event.payload as unknown as NotificationRequest);
        return;
      default:
        throw new Error(`Tipo de evento desconocido: ${String(event.type)}`);
    }
  }

  /** Métricas operativas del outbox (para health/monitorización). */
  async stats(): Promise<Record<OutboxStatus, number>> {
    const rows = await this.events
      .createQueryBuilder('e')
      .select('e.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('e.status')
      .getRawMany<{ status: OutboxStatus; count: string }>();
    const base: Record<OutboxStatus, number> = { PENDING: 0, SENT: 0, FAILED: 0 };
    for (const r of rows) base[r.status] = Number(r.count);
    return base;
  }
}
