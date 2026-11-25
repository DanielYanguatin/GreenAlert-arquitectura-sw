import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { UpstreamError } from '../common/http-client';
import type { Report } from '../reports/entities';
import { LocationStatus } from '../reports/report.domain';
import { type OutboxEvent, OutboxStatus, OutboxType } from './outbox-event.entity';
import { backoffDelay, OutboxService } from './outbox.service';

function event(overrides: Partial<OutboxEvent> = {}): OutboxEvent {
  return {
    id: 'e-1',
    type: OutboxType.NOTIFY,
    aggregateId: 'r-1',
    payload: { type: 'CAMBIO_ESTADO', recipientUserId: 'u', data: {} },
    status: OutboxStatus.PENDING,
    attempts: 0,
    nextAttemptAt: new Date(),
    lockedBy: 'x',
    lockedUntil: new Date(),
    lastError: null,
    createdAt: new Date(),
    sentAt: null,
    ...overrides,
  };
}

describe('backoffDelay', () => {
  it('crece exponencialmente y se limita a 10 minutos', () => {
    expect(backoffDelay(1)).toBe(5_000);
    expect(backoffDelay(2)).toBe(10_000);
    expect(backoffDelay(4)).toBe(40_000);
    expect(backoffDelay(30)).toBe(600_000);
  });
});

describe('OutboxService', () => {
  let events: Record<string, jest.Mock>;
  let reports: { update: jest.Mock };
  let geo: { upsert: jest.Mock; validate: jest.Mock };
  let notifications: { send: jest.Mock };
  let service: OutboxService;
  let pending: OutboxEvent[];

  beforeEach(() => {
    pending = [];
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    events = {
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(() => Promise.resolve(pending)),
      update: jest.fn().mockResolvedValue(undefined),
    };
    reports = { update: jest.fn().mockResolvedValue(undefined) };
    geo = {
      upsert: jest.fn().mockResolvedValue({ municipalityCode: '86001', municipalityName: 'Mocoa' }),
      validate: jest.fn(),
    };
    notifications = { send: jest.fn().mockResolvedValue(undefined) };
    service = new OutboxService(
      events as unknown as Repository<OutboxEvent>,
      reports as unknown as Repository<Report>,
      geo,
      notifications,
      new ConfigService({ OUTBOX_MAX_ATTEMPTS: 3, OUTBOX_INTERVAL_MS: 0 }),
    );
  });

  const lastUpdate = (): Partial<OutboxEvent> =>
    (events.update.mock.calls as [string, Partial<OutboxEvent>][]).at(-1)![1];

  it('entrega notificaciones y marca el evento como SENT', async () => {
    pending = [event()];
    await expect(service.dispatchPending()).resolves.toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(notifications.send).toHaveBeenCalledWith(pending[0].payload);
    expect(lastUpdate()).toMatchObject({ status: OutboxStatus.SENT, attempts: 1 });
  });

  it('sincroniza la ubicación y marca el reporte como VALIDATED', async () => {
    pending = [event({ type: OutboxType.LOCATION_UPSERT, payload: { latitude: 1, longitude: -76 } })];
    await service.dispatchPending();
    expect(geo.upsert).toHaveBeenCalledWith('r-1', { latitude: 1, longitude: -76 });
    expect(reports.update).toHaveBeenCalledWith(
      { id: 'r-1' },
      { locationStatus: LocationStatus.VALIDATED, municipalityCode: '86001', municipalityName: 'Mocoa' },
    );
  });

  it('reprograma con retroceso cuando el destino no está disponible', async () => {
    notifications.send.mockRejectedValue(new UpstreamError('Servicio no disponible'));
    pending = [event({ attempts: 1 })];
    const before = Date.now();
    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, retried: 1, failed: 0 });
    const update = lastUpdate();
    expect(update.status).toBe(OutboxStatus.PENDING);
    expect(update.attempts).toBe(2);
    expect(update.nextAttemptAt!.getTime()).toBeGreaterThanOrEqual(before + 10_000);
  });

  it('marca FAILED al agotar los intentos', async () => {
    notifications.send.mockRejectedValue(new UpstreamError('caído'));
    pending = [event({ attempts: 2 })];
    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, retried: 0, failed: 1 });
    expect(lastUpdate().status).toBe(OutboxStatus.FAILED);
  });

  it('no reintenta errores 4xx y marca la ubicación fuera de cobertura', async () => {
    geo.upsert.mockRejectedValue(new UpstreamError('fuera', 422));
    pending = [event({ type: OutboxType.LOCATION_UPSERT })];
    await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, retried: 0, failed: 1 });
    expect(reports.update).toHaveBeenCalledWith('r-1', { locationStatus: LocationStatus.OUT_OF_COVERAGE });
  });

  it('procesa el lote aunque un evento falle', async () => {
    notifications.send.mockRejectedValueOnce(new UpstreamError('caído')).mockResolvedValueOnce(undefined);
    pending = [event({ id: 'a' }), event({ id: 'b' })];
    await expect(service.dispatchPending()).resolves.toEqual({ sent: 1, retried: 1, failed: 0 });
  });
});
