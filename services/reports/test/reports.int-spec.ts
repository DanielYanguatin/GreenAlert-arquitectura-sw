import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { OutboxService } from '../src/outbox/outbox.service';
import { StubServer } from './stub-server';
import { resetTestDatabase } from './test-db';

const KEY = process.env.INTERNAL_API_KEY!;
const CITIZEN = '11111111-1111-4111-8111-111111111111';
const OTHER = '22222222-2222-4222-8222-222222222222';
const OFFICER = '33333333-3333-4333-8333-333333333333';
const MOCOA = { municipalityCode: '86001', municipalityName: 'Mocoa' };

const as = (userId: string, role: string) => ({
  'x-internal-api-key': KEY,
  'x-user-id': userId,
  'x-user-role': role,
  'x-user-email': 'x@y.co',
});
const citizen = as(CITIZEN, 'CIUDADANO');
const officer = as(OFFICER, 'GESTOR_AMBIENTAL');

const NEW_REPORT = {
  title: 'Basuras en la quebrada Taruca',
  description: 'Acumulación de residuos sólidos en la ribera, con mal olor.',
  category: 'BASURA',
  latitude: 1.1478,
  longitude: -76.6489,
  address: 'Barrio Los Pinos',
};

describe('reports (integración)', () => {
  let app: INestApplication<App>;
  const stub = new StubServer();

  beforeAll(async () => {
    await stub.start(Number(process.env.STUB_PORT ?? 47002));
    await resetTestDatabase('greenalert_reports_test');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
    await stub.stop();
  });

  beforeEach(() => {
    stub.calls.length = 0;
    stub
      .on('POST /internal/locations/validate', { status: 200, body: MOCOA })
      .on('PUT /internal/locations/', { status: 200, body: MOCOA })
      .on('POST /internal/notifications', { status: 202, body: {} })
      .on('GET /internal/users/', {
        status: 200,
        body: { id: OFFICER, role: 'FUNCIONARIO', active: true, fullName: 'F' },
      })
      .on('GET /internal/evidences', {
        status: 200,
        body: [{ id: 'e1', mimeType: 'image/jpeg', originalName: 'rio.jpg', sizeBytes: 100 }],
      })
      .on('POST /internal/classifications', {
        status: 201,
        body: {
          id: 'c1',
          suggestedCategory: 'BASURA',
          confidence: 0.4,
          provider: 'heuristic',
          modelVersion: 'v0',
          requiresReview: true,
        },
      });
  });

  const api = () => request(app.getHttpServer());
  const dispatch = () => app.get(OutboxService).dispatchPending();

  let reportId = '';

  it('rechaza solicitudes sin clave interna (401) y sin identidad (401)', async () => {
    await api().get('/reports/mine').expect(401);
    await api().get('/reports/mine').set('x-internal-api-key', KEY).expect(401);
  });

  it('crea un reporte (201), lo persiste con historial y valida la ubicación con geolocation', async () => {
    const res = await api().post('/reports').set(citizen).send(NEW_REPORT).expect(201);
    const body = res.body as { id: string; status: string; municipalityName: string; locationStatus: string };
    reportId = body.id;
    expect(body).toMatchObject({ status: 'PENDIENTE', municipalityName: 'Mocoa', locationStatus: 'VALIDATED' });
    expect(stub.callsTo('POST /internal/locations/validate')[0].headers['x-internal-api-key']).toBe(KEY);

    const history = await api().get(`/reports/${reportId}/history`).set(citizen).expect(200);
    expect((history.body as { action: string }[]).map((h) => h.action)).toEqual(['CREATED']);
  });

  it('el despachador del outbox entrega ubicación y notificaciones', async () => {
    const result = await dispatch();
    expect(result).toEqual({ sent: 3, retried: 0, failed: 0 });
    expect(stub.callsTo('PUT /internal/locations/')[0].body).toMatchObject({ category: 'BASURA', status: 'PENDIENTE' });
    const types = stub.callsTo('POST /internal/notifications').map((c) => (c.body as { type: string }).type);
    expect(types.sort()).toEqual(['NUEVO_REPORTE', 'REPORTE_RECIBIDO']);
  });

  it.each([
    [{ ...NEW_REPORT, latitude: 123 }, 'latitud fuera de rango'],
    [{ ...NEW_REPORT, category: 'NO_EXISTE' }, 'categoría inválida'],
    [{ ...NEW_REPORT, title: undefined }, 'título faltante'],
    [{ ...NEW_REPORT, userId: OTHER }, 'campo no permitido'],
  ])('valida la entrada %#: %s → 400', async (payload: object, _reason: string) => {
    await api().post('/reports').set(citizen).send(payload).expect(400);
  });

  it('rechaza con 422 un punto fuera de cobertura', async () => {
    stub.on('POST /internal/locations/validate', { status: 422, body: { message: 'fuera' } });
    await api().post('/reports').set(citizen).send(NEW_REPORT).expect(422);
  });

  it('geolocation caído: el reporte se crea igual (PENDING) y se valida al recuperarse', async () => {
    stub.off('POST /internal/locations/validate').off('PUT /internal/locations/');
    const res = await api().post('/reports').set(citizen).send(NEW_REPORT).expect(201);
    const id = (res.body as { id: string }).id;
    expect(res.body).toMatchObject({ locationStatus: 'PENDING', municipalityCode: null });

    const first = await dispatch();
    expect(first.retried).toBe(1); // ubicación pendiente de reintento

    stub.on('PUT /internal/locations/', { status: 200, body: MOCOA });
    await app
      .get(DataSource)
      .query('UPDATE outbox_events SET next_attempt_at = ? WHERE status = ?', [
        new Date(Date.now() - 3_600_000),
        'PENDING',
      ]);
    await dispatch();
    const detail = await api().get(`/reports/${id}`).set(citizen).expect(200);
    expect(detail.body).toMatchObject({ locationStatus: 'VALIDATED', municipalityName: 'Mocoa' });
  });

  it('otro ciudadano no puede ver el reporte (404) ni cambiar estados (403)', async () => {
    await api().get(`/reports/${reportId}`).set(as(OTHER, 'CIUDADANO')).expect(404);
    await api().patch(`/reports/${reportId}/status`).set(citizen).send({ status: 'EN_REVISION' }).expect(403);
  });

  it('el personal cambia estados según la máquina de estados', async () => {
    await api()
      .patch(`/reports/${reportId}/status`)
      .set(officer)
      .send({ status: 'RESUELTO', comment: 'x' })
      .expect(400);
    await api().patch(`/reports/${reportId}/status`).set(officer).send({ status: 'EN_REVISION' }).expect(200);
    const detail = await api().get(`/reports/${reportId}`).set(officer).expect(200);
    expect(detail.body).toMatchObject({ status: 'EN_REVISION', allowedTransitions: ['EN_PROCESO', 'RECHAZADO'] });
  });

  it('notifications caído: el cambio de estado se confirma y la notificación queda en el outbox', async () => {
    stub.off('POST /internal/notifications');
    await api().patch(`/reports/${reportId}/status`).set(officer).send({ status: 'EN_PROCESO' }).expect(200);
    const result = await dispatch();
    expect(result.retried).toBeGreaterThanOrEqual(1);
    const rows = await app
      .get(DataSource)
      .query<{ n: string }[]>("SELECT COUNT(*) AS n FROM outbox_events WHERE status='PENDING' AND type='NOTIFY'");
    expect(Number(rows[0].n)).toBeGreaterThanOrEqual(1);
  });

  it('asigna un responsable validado con users', async () => {
    await api().patch(`/reports/${reportId}/assignment`).set(officer).send({ assigneeId: OFFICER }).expect(200);
    const mine = await api().get('/reports?assignedTo=me').set(officer).expect(200);
    expect((mine.body as { items: { id: string }[] }).items.map((r) => r.id)).toContain(reportId);
  });

  it('registra observaciones y las devuelve en el detalle', async () => {
    await api()
      .post(`/reports/${reportId}/observations`)
      .set(officer)
      .send({ text: 'Visita técnica programada' })
      .expect(201);
    const detail = await api().get(`/reports/${reportId}`).set(citizen).expect(200);
    expect((detail.body as { observations: { text: string }[] }).observations[0].text).toBe(
      'Visita técnica programada',
    );
  });

  it('análisis IA: guarda la sugerencia como recomendación', async () => {
    const res = await api().post(`/reports/${reportId}/analysis`).set(citizen).expect(200);
    expect(res.body).toMatchObject({ aiStatus: 'COMPLETED', suggestedCategory: 'BASURA', requiresReview: true });
    const detail = await api().get(`/reports/${reportId}`).set(citizen).expect(200);
    expect(detail.body).toMatchObject({
      aiStatus: 'COMPLETED',
      aiSuggestedCategory: 'BASURA',
      aiConfidence: 0.4,
      category: 'BASURA',
    });
  });

  it('análisis IA con el servicio ai caído: 200 con UNAVAILABLE, el reporte sigue disponible', async () => {
    stub.off('POST /internal/classifications');
    const res = await api().post(`/reports/${reportId}/analysis`).set(citizen).expect(200);
    expect(res.body).toMatchObject({ aiStatus: 'UNAVAILABLE', suggestedCategory: null });
    await api().get(`/reports/${reportId}`).set(citizen).expect(200);
  });

  it('estadísticas para el panel institucional', async () => {
    const res = await api().get('/reports/stats').set(officer).expect(200);
    const body = res.body as { total: number; byStatus: Record<string, number> };
    expect(body.total).toBeGreaterThanOrEqual(2);
    expect(body.byStatus.EN_PROCESO).toBe(1);
    await api().get('/reports/stats').set(citizen).expect(403);
  });

  it('endpoint interno de acceso usado por multimedia', async () => {
    const res = await api().get(`/internal/reports/${reportId}/access`).set('x-internal-api-key', KEY).expect(200);
    expect(res.body).toEqual({ id: reportId, ownerId: CITIZEN, status: 'EN_PROCESO' });
  });

  it('mis reportes devuelve solo los del autor, paginados', async () => {
    const res = await api().get('/reports/mine?limit=1').set(citizen).expect(200);
    expect(res.body).toMatchObject({ limit: 1, page: 1 });
    expect((res.body as { total: number }).total).toBeGreaterThanOrEqual(2);
    await api().get('/reports/mine?limit=500').set(citizen).expect(400);
  });
});
