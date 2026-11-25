import { NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { InMemoryChannel } from '../channels/channels';
import { UpstreamError } from '../common/http-client';
import { type Notification, NotificationStatus, NotificationType } from './notification.entity';
import { backoffDelay, NotificationsService } from './notifications.service';

const U1 = '11111111-1111-4111-8111-111111111111';

function pending(overrides: Partial<Notification> = {}): Notification {
  return {
    id: 'n1',
    recipientUserId: U1,
    recipientEmail: null,
    type: NotificationType.CAMBIO_ESTADO,
    subject: 's',
    body: 'b',
    status: NotificationStatus.PENDING,
    attempts: 0,
    ...overrides,
  } as Notification;
}

describe('NotificationsService', () => {
  let repo: Record<string, jest.Mock>;
  let users: { findById: jest.Mock; findByRoles: jest.Mock };
  let channel: InMemoryChannel;
  let service: NotificationsService;
  let claimed: Notification[];

  beforeEach(() => {
    claimed = [];
    const qb = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    repo = {
      create: jest.fn((n: Partial<Notification>) => n),
      save: jest.fn((list: Partial<Notification>[]) => Promise.resolve(list.map((n, i) => ({ ...n, id: `n${i}` })))),
      createQueryBuilder: jest.fn(() => qb),
      find: jest.fn(() => Promise.resolve(claimed)),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
      count: jest.fn().mockResolvedValue(0),
    };
    users = {
      findById: jest.fn().mockResolvedValue({ id: U1, email: 'ana@example.com', fullName: 'Ana', active: true }),
      findByRoles: jest.fn().mockResolvedValue([
        { id: 'f1', email: 'f1@x.co', fullName: 'F1', active: true },
        { id: 'f2', email: 'f2@x.co', fullName: 'F2', active: false },
      ]),
    };
    channel = new InMemoryChannel();
    service = new NotificationsService(
      repo as unknown as Repository<Notification>,
      users,
      channel,
      new ConfigService({ NOTIFICATIONS_MAX_ATTEMPTS: 3, NOTIFICATIONS_INTERVAL_MS: 0 }),
    );
  });

  const lastUpdate = (): Partial<Notification> =>
    (repo.update.mock.calls as [string, Partial<Notification>][]).at(-1)![1];

  it('retroceso exponencial con tope de 30 minutos', () => {
    expect(backoffDelay(1)).toBe(10_000);
    expect(backoffDelay(3)).toBe(40_000);
    expect(backoffDelay(50)).toBe(1_800_000);
  });

  describe('accept', () => {
    it('encola una notificación individual con el mensaje ya renderizado', async () => {
      const res = await service.accept({
        type: NotificationType.REGISTRO,
        recipientUserId: U1,
        data: { fullName: 'Ana' },
      });
      expect(res.accepted).toBe(1);
      const saved = (repo.save.mock.calls as Partial<Notification>[][][])[0][0][0];
      expect(saved).toMatchObject({
        recipientUserId: U1,
        status: NotificationStatus.PENDING,
        subject: 'Bienvenido(a) a GreenAlert',
      });
    });

    it('difunde a los usuarios activos de los roles indicados', async () => {
      const res = await service.accept({
        type: NotificationType.NUEVO_REPORTE,
        recipientRoles: ['FUNCIONARIO'],
        data: { title: 't' },
      });
      expect(res.accepted).toBe(1);
      expect(users.findByRoles).toHaveBeenCalledWith(['FUNCIONARIO']);
    });

    it('responde 503 si no puede resolver destinatarios por rol (el emisor reintenta)', async () => {
      users.findByRoles.mockRejectedValue(new UpstreamError('caído'));
      await expect(
        service.accept({ type: NotificationType.NUEVO_REPORTE, recipientRoles: ['FUNCIONARIO'], data: {} }),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
    });

    it('no encola nada si no hay destinatarios activos', async () => {
      users.findByRoles.mockResolvedValue([]);
      await expect(
        service.accept({ type: NotificationType.ALERTA, recipientRoles: ['ADMIN'], data: {} }),
      ).resolves.toEqual({ accepted: 0, ids: [] });
    });
  });

  describe('dispatchPending', () => {
    it('resuelve el correo, envía y marca SENT', async () => {
      claimed = [pending()];
      await expect(service.dispatchPending()).resolves.toEqual({ sent: 1, retried: 0, failed: 0 });
      expect(channel.sent[0]).toEqual({ to: 'ana@example.com', subject: 's', body: 'b' });
      expect(lastUpdate()).toMatchObject({ status: NotificationStatus.SENT, recipientEmail: 'ana@example.com' });
    });

    it('usa el correo conocido sin consultar a users', async () => {
      claimed = [pending({ recipientEmail: 'ya@x.co' })];
      await service.dispatchPending();
      expect(users.findById).not.toHaveBeenCalled();
    });

    it('reintenta si el canal falla', async () => {
      channel.failNext = 1;
      claimed = [pending({ recipientEmail: 'a@x.co' })];
      await expect(service.dispatchPending()).resolves.toEqual({ sent: 0, retried: 1, failed: 0 });
      expect(lastUpdate()).toMatchObject({
        status: NotificationStatus.PENDING,
        attempts: 1,
        lastError: 'Fallo simulado del canal',
      });
    });

    it('reintenta si users no está disponible', async () => {
      users.findById.mockRejectedValue(new UpstreamError('caído'));
      claimed = [pending()];
      await expect(service.dispatchPending()).resolves.toMatchObject({ retried: 1 });
    });

    it('marca FAILED al agotar intentos o si el destinatario no existe', async () => {
      channel.failNext = 1;
      claimed = [pending({ recipientEmail: 'a@x.co', attempts: 2 })];
      await expect(service.dispatchPending()).resolves.toMatchObject({ failed: 1 });
      users.findById.mockRejectedValue(new UpstreamError('no existe', 404));
      claimed = [pending()];
      await expect(service.dispatchPending()).resolves.toMatchObject({ failed: 1 });
      expect(lastUpdate().status).toBe(NotificationStatus.FAILED);
    });
  });

  it('solo marca como leídas las notificaciones propias', async () => {
    await service.markRead(U1, 'n1');
    expect(repo.update).toHaveBeenCalledWith({ id: 'n1', recipientUserId: U1 }, { read: true });
    repo.update.mockResolvedValue({ affected: 0 });
    await expect(service.markRead('otro', 'n1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pagina el historial del usuario', async () => {
    await service.listForUser(U1, { page: 2, limit: 5 });
    expect(repo.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({ where: { recipientUserId: U1 }, skip: 5, take: 5 }),
    );
  });
});
