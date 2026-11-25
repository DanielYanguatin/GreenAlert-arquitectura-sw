import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { InMemoryChannel } from '../src/channels/channels';
import { NotificationsService } from '../src/notifications/notifications.service';
import { StubServer } from './stub-server';
import { resetTestDatabase } from './test-db';

const KEY = process.env.INTERNAL_API_KEY!;
const internal = { 'x-internal-api-key': KEY };
const CITIZEN = '11111111-1111-4111-8111-111111111111';
const OFFICER = '33333333-3333-4333-8333-333333333333';
const as = (id: string, role: string) => ({ ...internal, 'x-user-id': id, 'x-user-role': role });

describe('notifications (integración)', () => {
  let app: INestApplication<App>;
  const stub = new StubServer();

  beforeAll(async () => {
    await stub.start(Number(process.env.STUB_PORT ?? 47006));
    await resetTestDatabase('greenalert_notifications_test');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stub.stop();
  });

  beforeEach(() => {
    stub
      .on(`GET /internal/users/${CITIZEN}`, {
        status: 200,
        body: { id: CITIZEN, email: 'ciudadano@example.com', fullName: 'C', active: true },
      })
      .on('GET /internal/users?roles=', {
        status: 200,
        body: [{ id: OFFICER, email: 'funcionario@example.com', fullName: 'F', active: true }],
      });
  });

  const api = () => request(app.getHttpServer());
  const dispatch = () => app.get(NotificationsService).dispatchPending();
  const channel = () => app.get(InMemoryChannel);

  it('acepta (202) una notificación de cambio de estado y la entrega por el canal', async () => {
    const res = await api()
      .post('/internal/notifications')
      .set(internal)
      .send({
        type: 'CAMBIO_ESTADO',
        recipientUserId: CITIZEN,
        data: { title: 'Basura', from: 'PENDIENTE', to: 'EN_REVISION' },
      })
      .expect(202);
    expect(res.body).toMatchObject({ accepted: 1 });
    await expect(dispatch()).resolves.toEqual({ sent: 1, retried: 0, failed: 0 });
    expect(channel().sent.at(-1)).toMatchObject({
      to: 'ciudadano@example.com',
      subject: 'Tu reporte «Basura» ahora está: En revisión',
    });
  });

  it('difunde avisos a funcionarios resolviendo destinatarios en users', async () => {
    const res = await api()
      .post('/internal/notifications')
      .set(internal)
      .send({
        type: 'NUEVO_REPORTE',
        recipientRoles: ['FUNCIONARIO', 'GESTOR_AMBIENTAL'],
        data: { title: 'Quema', category: 'HUMO_QUEMAS' },
      })
      .expect(202);
    expect(res.body).toMatchObject({ accepted: 1 });
    await dispatch();
    expect(channel().sent.at(-1)?.to).toBe('funcionario@example.com');
    expect(stub.callsTo('GET /internal/users?roles=')[0].url).toContain('FUNCIONARIO%2CGESTOR_AMBIENTAL');
  });

  it('users caído al difundir → 503 (el emisor reintenta desde su outbox)', async () => {
    stub.off('GET /internal/users?roles=');
    await api()
      .post('/internal/notifications')
      .set(internal)
      .send({ type: 'NUEVO_REPORTE', recipientRoles: ['FUNCIONARIO'], data: {} })
      .expect(503);
  });

  it('fallo del canal: la notificación queda PENDING con el error y se entrega en el reintento', async () => {
    await api()
      .post('/internal/notifications')
      .set(internal)
      .send({ type: 'ASIGNACION', recipientUserId: CITIZEN, data: { title: 'X' } })
      .expect(202);
    channel().failNext = 1;
    await expect(dispatch()).resolves.toMatchObject({ retried: 1 });
    const [row] = await app
      .get(DataSource)
      .query<{ status: string; attempts: number; last_error: string }[]>(
        "SELECT status, attempts, last_error FROM notifications WHERE type='ASIGNACION'",
      );
    expect(row).toMatchObject({ status: 'PENDING', attempts: 1, last_error: 'Fallo simulado del canal' });

    await app
      .get(DataSource)
      .query("UPDATE notifications SET next_attempt_at = ? WHERE type='ASIGNACION'", [
        new Date(Date.now() - 3_600_000),
      ]);
    await expect(dispatch()).resolves.toMatchObject({ sent: 1 });
  });

  it.each([
    [{ type: 'NO_EXISTE', recipientUserId: CITIZEN, data: {} }, 'tipo inválido'],
    [{ type: 'REGISTRO', data: {} }, 'sin destinatario'],
    [{ type: 'REGISTRO', recipientUserId: 'x', data: {} }, 'destinatario inválido'],
    [{ type: 'ALERTA', recipientRoles: ['ROOT'], data: {} }, 'rol inválido'],
  ])('valida la entrada %# (%s) → 400', async (body: object, _reason: string) => {
    await api().post('/internal/notifications').set(internal).send(body).expect(400);
  });

  it('historial propio y marca de lectura', async () => {
    const res = await api().get('/notifications/me').set(as(CITIZEN, 'CIUDADANO')).expect(200);
    const page = res.body as { total: number; items: { id: string; status: string }[] };
    expect(page.total).toBe(2);
    expect(page.items.every((n) => n.status === 'SENT')).toBe(true);
    await api().patch(`/notifications/${page.items[0].id}/read`).set(as(OFFICER, 'FUNCIONARIO')).expect(404);
    await api().patch(`/notifications/${page.items[0].id}/read`).set(as(CITIZEN, 'CIUDADANO')).expect(204);
  });

  it('vista administrativa restringida a ADMIN', async () => {
    await api().get('/notifications').set(as(CITIZEN, 'CIUDADANO')).expect(403);
    const res = await api().get('/notifications/stats').set(as('a', 'ADMIN')).expect(200);
    expect(res.body).toMatchObject({ SENT: 3, PENDING: 0, FAILED: 0 });
  });
});
