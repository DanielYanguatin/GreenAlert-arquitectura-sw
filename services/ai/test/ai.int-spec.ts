import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { resetTestDatabase } from './test-db';

const KEY = process.env.INTERNAL_API_KEY!;
const internal = { 'x-internal-api-key': KEY };
const REPORT = '77777777-7777-4777-8777-777777777777';
const payload = {
  reportId: REPORT,
  text: 'Tala de árboles en la vereda. Se escuchan motosierras.',
  evidences: [
    {
      id: '88888888-8888-4888-8888-888888888888',
      url: 'http://multimedia:3003/internal/evidences/88888888-8888-4888-8888-888888888888/file',
      mimeType: 'image/jpeg',
      originalName: 'bosque.jpg',
    },
  ],
};

describe('ai (integración)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    await resetTestDatabase('greenalert_ai_test');
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = configureApp(moduleRef.createNestApplication()) as INestApplication<App>;
    await app.init();
  });

  afterAll(() => app?.close());
  const api = () => request(app.getHttpServer());

  it('clasifica y persiste la sugerencia (proveedor heurístico de prueba)', async () => {
    const res = await api().post('/internal/classifications').set(internal).send(payload).expect(201);
    expect(res.body).toMatchObject({
      reportId: REPORT,
      suggestedCategory: 'DEFORESTACION',
      provider: 'heuristic-keywords',
      requiresReview: true,
    });
    const rows = await app.get(DataSource).query<{ n: string }[]>('SELECT COUNT(*) AS n FROM classifications');
    expect(Number(rows[0].n)).toBe(1);
  });

  it.each([
    [{ ...payload, evidences: [] }, 'sin evidencias'],
    [{ ...payload, reportId: 'x' }, 'reportId inválido'],
    [{ ...payload, evidences: [{ ...payload.evidences[0], mimeType: 'application/pdf' }] }, 'tipo no permitido'],
    [{ ...payload, evidences: [{ ...payload.evidences[0], url: 'javascript:alert(1)' }] }, 'URL no permitida'],
  ])('rechaza datos incorrectos %# (%s) con 400', async (body: object, _reason: string) => {
    await api().post('/internal/classifications').set(internal).send(body).expect(400);
  });

  it('el historial solo es visible para personal institucional', async () => {
    const staff = { ...internal, 'x-user-id': 'f', 'x-user-role': 'FUNCIONARIO' };
    const res = await api().get(`/classifications?reportId=${REPORT}`).set(staff).expect(200);
    expect(res.body).toHaveLength(1);
    await api()
      .get(`/classifications?reportId=${REPORT}`)
      .set({ ...internal, 'x-user-id': 'c', 'x-user-role': 'CIUDADANO' })
      .expect(403);
  });

  it('publica las categorías soportadas', async () => {
    const res = await api().get('/classifications/categories').set(internal).expect(200);
    expect((res.body as { code: string }[]).map((c) => c.code)).toEqual([
      'BASURA',
      'CONTAMINACION_HIDRICA',
      'DEFORESTACION',
      'HUMO_QUEMAS',
      'VERTIMIENTOS',
      'MINERIA_ILEGAL',
    ]);
  });

  it('rechaza llamadas sin clave interna', async () => {
    await api().post('/internal/classifications').send(payload).expect(401);
  });
});
